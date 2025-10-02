import { isAbsolute, extname, join, resolve, sep } from 'node:path'
import { getFreePorts } from './network.js'

import { spawn, fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { ResolvedService, ActiveServices, ActiveService, HooksInterface } from '../../types.js'

import { loadEnvironmentVariables } from './env/index.js'

import { getLocalIP } from './ip.js'
import { createLogger } from '../utils/logger.js'
import { globalServiceWorkspacePath, globalTempServiceWorkspacePath } from './paths.js'

const logger = createLogger('services')

const createNoOpHooks = (): HooksInterface => ({
  emit: () => {},
  on: () => () => {}
})

type ServiceOptions = {
  root: string
  target?: string // For desktop check
  services?: any // Truthy
  build?: boolean // Default: true
  hooks?: HooksInterface
}

const WINDOWS = process.platform === 'win32'

const jsExtensions = ['.js', '.cjs', '.mjs']

// Ensure marked for Node.js usage
const precompileExtensions = {
  node: [{ from: '.ts', to: '.cjs' }],
  cpp: [{ from: '.cpp', to: '.exe' }],
}

const autobuildExtensions = {
  node: [...jsExtensions, ...precompileExtensions.node.map(({ from }) => from)],
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

const resolvePath = (root, path) => path && (isAbsolute(path) ? path : resolve(root, path))

const isDesktop = target => target === 'desktop' || target === 'electron'
const isMobile = target => target === 'mobile' || target === 'ios' || target === 'android'

// ------------------------------------ COPIED ---------------------------------------

// NOTE: From core/utils/url.js to remove the need to copy this asset...
export const isValidURL = s => {
  if (existsSync(s)) return false

  try {
    new URL(s)
    return true
  } catch (err) {
    return false
  }
}

// ------------------------------------------------------------------------------------
let processes = {}

export const resolveServiceConfiguration = config => {
  if (typeof config === 'string') return isValidURL(config) ? { url: config } : { src: config }
  return config
}

const publishKeys = {
  local: 'local',
  remote: 'remote',
}

export function resolveServiceBuildInfo(service, name, opts: ServiceOptions) {
  // MOVED HERE
  const { root, target, services, build: isBuildProcess = true } = opts


  const isServicesOnlyBuild = !!services
  const isDesktopTarget = isDesktop(target)
  const isLocalMode = !!(isDesktopTarget || isServicesOnlyBuild)

  if (service.__src) return service // Pre-resolved service

  const publishMode = isLocalMode ? 'local' : 'remote'

  const resolved = resolveServiceConfiguration(service)
  const { src: originalSource, ...resolvedWithoutSource } = resolved // Use OG source

  const hasModeSpecificConfig =
    resolved.publish &&
    typeof resolved.publish === 'object' &&
    Object.values(publishKeys).find(key => key in resolved.publish)

  const basePublish = resolveServiceConfiguration(resolved.publish)
  const modePublish = resolveServiceConfiguration(
    hasModeSpecificConfig && resolved.publish[publishMode]
  )

  const { local, remote, ...publishConfig } = basePublish || {}

  const blockBuild = hasModeSpecificConfig ? modePublish === false : basePublish === false

  // Reject services that are not published
  if (isBuildProcess && blockBuild && !isServicesOnlyBuild) return // Do not block if only a service

  const resolvedPublishConfig = { ...publishConfig }
  Object.assign(resolvedPublishConfig, modePublish) // Overwrite generic features with mode-specific config

  if (isBuildProcess) Object.assign(resolvedWithoutSource, resolvedPublishConfig) // Merge publish info with general info

  const { build } = resolvedWithoutSource

  const autoBuild =
    !build && originalSource && autobuildExtensions.node.includes(extname(originalSource))
  const toCompile =
    originalSource &&
    Object.values(precompileExtensions)
      .flat()
      .find(({ from }) => originalSource.endsWith(from))

  const requiresBuild = autoBuild || toCompile || build

  // Assign source and base items to determine filepath
  if (requiresBuild) {
    const buildingProductionVersion = isBuildProcess || build

    // In development mode, compile source files in a temporary directory
    const outLocation = join(
      buildingProductionVersion ? globalServiceWorkspacePath : globalTempServiceWorkspacePath,
      name
    )

    const __compile = toCompile || build

    const { base: publishBase, src: publishSrc } = resolvedPublishConfig

    const isConfigured = publishBase || publishSrc
    
    Object.assign(resolvedWithoutSource, {
      base: isConfigured ? publishBase : outLocation,
      src:
        publishSrc ??
        (autoBuild
          ? isBuildProcess
            ? name
            : `${name}.cjs`
          : toCompile
            ? `compiled${toCompile.to}`
            : name), // Use default output name
      __autobuild: autoBuild,
      __compile,
    })
  }

  // Adjust filepath to the user-specified output location
  if (requiresBuild) {
    const { base = null, src: outSrc } = resolvedWithoutSource
    resolvedWithoutSource.filepath = join(base ?? '', outSrc)
  }

  // Remove or add extensions based on platform
  if (resolvedWithoutSource.filepath) {
    const fileExtension = extname(resolvedWithoutSource.filepath)
    if (WINDOWS && !fileExtension)
      resolvedWithoutSource.filepath += '.exe' // Add .exe (Win)
    else if (!WINDOWS && fileExtension === '.exe')
      resolvedWithoutSource.filepath = resolvedWithoutSource.filepath.slice(0, -4) // Remove .exe (Unix)
  }

  // For non-service builds, skip builds for non-URLS or if not local mode
  if (!isServicesOnlyBuild) {
    const { url } = resolvedWithoutSource

    // Ensure remote URLs are treated as such
    const isRemoteUrl = !getLocalUrl(url)
    if (isRemoteUrl) return { url }

    // Only URLs should pass in remote mode
    if (isBuildProcess && !isLocalMode) {
      const { url } = resolvedWithoutSource
      if (!url) return // Reject services that do not have a URL
      return { url }
    }
  }

  const {
    src,
    url,
    base,
    filepath,
    public: isPublic,
    port,
    __autobuild,
    __compile,
  } = resolvedWithoutSource

  // Resolve filepath
  const fullFile = filepath && resolvePath(root, filepath)
  const willBeBuilt = isBuildProcess || __compile || __autobuild

  const file =
    fullFile && willBeBuilt
      ? isDesktopTarget
        ? fullFile.replace(`app.asar${sep}`, '')
        : fullFile
      : null // Reference correctly from build Electron application

  return {
    src,
    url,
    build,
    base: base && resolvePath(root, base),
    filepath: file,

    public: isPublic,
    port,

    __autobuild,
    __compile,
  }
}

function getLocalUrl(url) {
  const _url = new URL(url || `http://localhost`)
  return LOCAL_HOSTS.includes(_url.hostname) ? _url : null
}

async function getServiceUrl(service) {
  const resolved = resolveServiceConfiguration(service)
  const { url, port, src } = resolved

  if (!src) return url // Cannot generate URL without source file

  // Only modify URL if a source file is provided
  const _url = getLocalUrl(url)

  if (_url) {
    const resolvedPort = port || (await getFreePorts(1))[0]
    if (!_url.port) _url.port = resolvedPort.toString() // Use the specified port
    return _url.href
  }

  return url
}

export async function resolveService(config, name, opts: ServiceOptions) {
  const isResolved = config.__src
  if (isResolved) return config // Ensures that references are maintained throughout the application

  const { root, target } = opts

  // Use the URL to determine the appropriate build strategy
  const resolved = resolveServiceConfiguration(config)

  const { src, monitor } = resolved

  // Resolve service publish info
  const resolvedForBuild = resolveServiceBuildInfo(resolved, name, opts)

  if (!resolvedForBuild) return // Reject flagged service

  // Return URL only
  const keys = Object.keys(resolvedForBuild)
  const onlyURL = keys.length === 1 && keys[0] === 'url'
  if (onlyURL) return resolvedForBuild

  // Return buildable service
  const {
    port,
    filepath,
    base,
    build,
    url,
    __src = src && resolve(root, src),
    __compile,
    __autobuild,
  } = resolvedForBuild

  resolvedForBuild.url = await getServiceUrl({ src, url, port })

  const isMobileTarget = isMobile(target)

  if (isMobileTarget && getLocalUrl(resolvedForBuild.url)) {
    const host = getLocalIP() // Use public IP address for mobile development
    resolvedForBuild.public = true // All services are public in mobile mode
    const url = new URL(resolvedForBuild.url)
    url.hostname = host
    resolvedForBuild.url = url.toString() // Transform localhost references to public IP
  }

  return {
    // For Build Configuration
    filepath: filepath || __src,
    base,
    build, // Build Info
    __src,
    __compile,
    __autobuild, // Flags

    // For Client
    url: resolvedForBuild.url,
    public: !!resolvedForBuild.public,

    status: null,

    monitor,
  }
}

const isExecutable = ext => ext === '.exe' || !ext

// Create and monitor arbitary processes
export async function start(
  config, 
  id, 
  opts
) {
  const label = id ?? 'commoners-service'

  const { hooks = createNoOpHooks() } = opts

  config = await resolveService(config, id, opts)

  if (!config) return

  const { filepath, monitor = {} } = config

  if (!filepath) return

  if (filepath) {
    let childProcess
    const ext = extname(filepath)

    let error

    const resolvedURL = new URL(config.url)

    resolvedURL.hostname = config.public ? '0.0.0.0' : resolvedURL.hostname

    logger.debug('Emitting service:launch:start', { service: label, filepath })
    hooks.emit({ type: 'service:launch:start',  service: label, filepath })

    try {
      const _cwd = process.cwd()
      const { build, root = _cwd } = opts
      const cwd = build ? _cwd : root

      const mode = build ? 'production' : 'development'
      const userEnv = loadEnvironmentVariables(mode, root)

      // Share environment variables with the child process
      const env = {
        ...userEnv,
        ...process.env,
        PORT: resolvedURL.port,
        HOST: resolvedURL.hostname,
      }

      const resolvedFilepath = resolve(
        isExecutable(ext) && !ext && existsSync(filepath + '.exe') ? filepath + '.exe' : filepath
      )

      const fileExists = existsSync(resolvedFilepath)

      if (!fileExists) {
        logger.debug('Emitting service:launch:error', { service: label, filepath: resolvedFilepath })
        return hooks.emit({
          type: 'service:launch:error',
          error: new Error(`File does not exist at ${resolvedFilepath}`),
          service: label,
        })
      }

      const resolvedProcessOptions = {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'] as ('pipe' | 'ipc')[], // Added 'ipc' for fork() communication
        shell: false,
        windowsHide: true,
        detached: false,
      }

      if (jsExtensions.includes(ext)) childProcess = fork(resolvedFilepath, [], { ...resolvedProcessOptions, silent: true }) // Node Support
      else if (ext === '.py') childProcess = spawn('python', [resolvedFilepath], resolvedProcessOptions)  // Python Support
      else if (isExecutable(ext)) childProcess = spawn(resolvedFilepath, [], resolvedProcessOptions) // Executable Support
    } catch (e) {
      error = e
    }
    

    if (childProcess) {

      if (childProcess.stdout && monitor.stdout !== false)
        childProcess.stdout.on('data', data => {
          config.status = true
          if (opts.onLog) opts.onLog(id, data)
          logger.debug('Emitting service:stdout', { service: label })
          hooks.emit({
            type: 'service:stdout',
            service: label,
            data,
          })
        })

      if (childProcess.stderr && monitor.stderr !== false) childProcess.stderr.on('data', data => {
        logger.debug('Emitting service:stderr', { service: label })
        hooks.emit({ type: 'service:stderr', service: label, data })
      })


      // Notify of process closure gracefully
      childProcess.on('close', code => {
        config.status = false
        if (opts.onClosed) opts.onClosed(id, code)
        delete processes[id]
        logger.debug('Emitting service:exit', { service: label, code })
        hooks.emit({ type: 'service:exit', service: label, code  })
      })


      logger.debug('Emitting service:launch:complete', { service: label, url: resolvedURL.href, filepath })
      hooks.emit({ type: 'service:launch:complete',  service: label, url: resolvedURL.href, filepath })
      processes[id] = childProcess

      return { ...config, process: childProcess } as ActiveService
    } else {
      logger.debug('Emitting service:launch:error', { service: label, filepath })
      hooks.emit({ type: 'service:launch:error', service: label, filepath, error })
    }
  }
}

const killProcess = p => {
  try {
    return p.kill()
  } catch (e) {
    console.error(`Failed to kill process ${p.pid}:`, e instanceof Error ? e.message : e)
  }
}

export function close(id?: string) {
  // Kill Specific Process
  if (id) {
    if (processes[id]) {
      killProcess(processes[id])
      delete processes[id]
    } else {
      console.warn(`No process exists with id ${id}`)
    }
  }

  // Kill All Processes
  else {
    for (const id in processes) killProcess(processes[id])
    processes = {}
  }
}

export const sanitize = (
  services: Record<string, ResolvedService> // NOTE: May not have URL...
) => {
  return Object.entries(services)

    .filter(([_, { url }]) => url)

    .reduce((acc, [id, info]) => {
      const { url } = info
      acc[id] = { url }

      return acc
    }, {})
}

export async function resolveAll(servicesToResolve = {}, opts) {
  const serviceInfo = {}

  const allServices = Object.keys(servicesToResolve)
  const { services } = opts

  let selectedServices

  const typeOf = typeof services
  if (typeOf === 'string') selectedServices = [services]
  else if (typeOf === 'boolean') {
    if (services) selectedServices = allServices
    else selectedServices = []
  } else selectedServices = services || allServices

  await Promise.all(
    selectedServices.map(async name => {
      if (!selectedServices.includes(name)) return
      const config = servicesToResolve[name]
      const service = await resolveService(config, name, opts)
      if (!service) return
      serviceInfo[name] = service
    })
  ) // Run sidecars automatically based on the configuration file

  return serviceInfo as Record<string, ResolvedService>
}

export async function createAll(services = {}, opts) {
  const resolved = await resolveAll(services, opts)

  // Run sidecars automatically based on the configuration file
  const activeServices: ActiveServices = {}
  await Promise.all(
    Object.entries(resolved).map(async ([id, config]) => {
      const active = await start(config, id, opts)
      if (!active) return
      activeServices[id] = active
    })
  )

  return {
    active: activeServices,
    resolved,
    close,
  }
}

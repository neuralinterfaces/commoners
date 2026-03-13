import { isAbsolute, extname, join, resolve, sep, relative } from 'node:path'
import { getFreePorts } from './network.js'

import { spawn, fork, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { ResolvedService, ActiveServices, ActiveService, HooksInterface } from '../../types.js'

import { loadEnvironmentVariables } from './env/index.js'

import { getLocalIP } from './ip.js'
import { createLogger } from '../utils/logger.js'
import { globalServiceWorkspacePath, globalTempServiceWorkspacePath } from './paths.js'

const logger = createLogger('services')

const createNoOpHooks = (): HooksInterface => ({
  emit: () => {},
  on: () => () => {},
})

type ServiceOptions = {
  root: string
  target?: string // For desktop check
  services?: any // Truthy
  build?: boolean // Default: true
  hooks?: HooksInterface
  hashManifest?: Record<string, string> | null // SHA256 hashes of service binaries for integrity verification
}

const WINDOWS = process.platform === 'win32'

const MAX_PORT_RETRIES = 3
const EARLY_EXIT_WINDOW_MS = 5000

const jsExtensions = ['.js', '.cjs', '.mjs']

// Ensure marked for Node.js usage
const precompileExtensions = {
  node: [{ from: '.ts', to: '.cjs' }],
  cpp: [{ from: '.cpp', to: '.exe' }],
  rust: [{ from: '.rs', to: '.exe' }],
  wasm: [{ from: '.rs', to: '.wasm' }],
}

const autobuildExtensions = {
  node: [...jsExtensions, ...precompileExtensions.node.map(({ from }) => from)],
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

/** Verify that the expected PID owns the given port. Returns null on platforms/errors where check is unavailable. */
export function verifyPortOwnership(port: string, expectedPid: number): { match: boolean; pids: number[] } | null {
  if (process.platform === 'win32') return null
  try {
    const output = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8', timeout: 3000 }).trim()
    const pids = output.split('\n').map(p => parseInt(p, 10)).filter(Boolean)
    if (pids.length === 0) return null
    return { match: pids.includes(expectedPid), pids }
  } catch {
    return null
  }
}

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
  } catch {
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

  // WASM services run in-browser, not as child processes — skip URL/PORT assignment
  if (service.__wasm) {
    const resolved = resolveServiceConfiguration(service)
    return {
      ...resolved,
      __wasm: true,
      type: 'wasm',
      filepath: resolved.src && resolvePath(root, resolved.src),
      ...(service.capabilities ? { capabilities: service.capabilities } : {}),
    }
  }

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { local: _local, remote: _remote, ...publishConfig } = basePublish || {}

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
    env,
    protocol,
    ssl,
    capabilities,
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

  // Resolve SSL certificate paths
  let resolvedSSL = undefined
  if (ssl?.key && ssl?.cert) {
    const keyPath = resolvePath(root, ssl.key)
    const certPath = resolvePath(root, ssl.cert)

    // Only include SSL if both files exist
    if (existsSync(keyPath) && existsSync(certPath)) {
      // For desktop targets being built, adjust paths for ASAR packaging
      // Store paths that will work at runtime
      const adjustPathForDesktop = (path: string) => {
        if (!isDesktopTarget || !isBuildProcess) return path

        // Make path relative to root for packaging
        const relativePath = relative(root, path)

        // At runtime in Electron, these will be in extraResources
        // so we return a marker that will be resolved at runtime
        return `__RUNTIME_SSL__/${relativePath}`
      }

      resolvedSSL = {
        key: adjustPathForDesktop(keyPath),
        cert: adjustPathForDesktop(certPath),
        // Store original paths for build-time asset collection
        __keySource: keyPath,
        __certSource: certPath,
      }
    } else {
      logger.warn(`SSL configuration provided but certificate files not found:`)
      if (!existsSync(keyPath)) logger.warn(`  - Key file not found: ${keyPath}`)
      if (!existsSync(certPath)) logger.warn(`  - Cert file not found: ${certPath}`)
    }
  }

  return {
    src,
    url,
    build,
    env,
    protocol,
    ssl: resolvedSSL,
    base: base && resolvePath(root, base),
    filepath: file,

    public: isPublic,
    port,

    __autobuild,
    __compile,
    ...(capabilities ? { capabilities } : {}),
  }
}

function getLocalUrl(url) {
  const _url = new URL(url || `http://localhost`)
  return LOCAL_HOSTS.includes(_url.hostname) ? _url : null
}

async function getServiceUrl(service) {
  const resolved = resolveServiceConfiguration(service)
  const { url, port, src, ssl, protocol } = resolved

  if (!src) return { url, __portAutoAllocated: false } // Cannot generate URL without source file

  // Only modify URL if a source file is provided
  const _url = getLocalUrl(url)

  if (_url) {
    const __portAutoAllocated = !port
    const resolvedPort = port || (await getFreePorts(1))[0]
    if (!_url.port) _url.port = resolvedPort.toString() // Use the specified port

    // Auto-update protocol to https when SSL is configured

    if (protocol)
      _url.protocol = protocol // Use custom protocol if provided
    else if (ssl?.key && ssl?.cert) _url.protocol = 'https:'

    return { url: _url.href, __portAutoAllocated }
  }

  return { url, __portAutoAllocated: false }
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

  // WASM services run in-browser — return early with markers preserved
  if (resolvedForBuild.__wasm || resolvedForBuild.type === 'wasm') return resolvedForBuild

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
    protocol,
    ssl,
    __src = src && resolve(root, src),
    __compile,
    __autobuild,
  } = resolvedForBuild

  const { url: resolvedUrl, __portAutoAllocated } = await getServiceUrl({
    src,
    url,
    port,
    ssl,
    protocol,
  })
  resolvedForBuild.url = resolvedUrl

  const isMobileTarget = isMobile(target)

  if (isMobileTarget && getLocalUrl(resolvedForBuild.url)) resolvedForBuild.public = true // All services are public in mobile mode

  // Map URLs to the public IP address when requested
  if (resolvedForBuild.public) {
    const host = getLocalIP() // Use public IP address
    const url = new URL(resolvedForBuild.url)
    url.hostname = host
    resolvedForBuild.url = url.toString() // Transform localhost references to public IP
  }

  return {
    // For Build Configuration
    filepath: filepath || __src,
    base,
    build, // Build Info
    env: resolvedForBuild.env,
    ssl: resolvedForBuild.ssl,
    __src,
    __compile,
    __autobuild, // Flags
    __portAutoAllocated,

    // For Client
    url: resolvedForBuild.url,
    public: !!resolvedForBuild.public,

    status: null,

    monitor,

    ...(resolvedForBuild.capabilities ? { capabilities: resolvedForBuild.capabilities } : {}),
  }
}

const isExecutable = ext => ext === '.exe' || !ext

// Create and monitor arbitary processes
export async function start(config, id, opts) {
  const label = id ?? 'commoners-service'

  const { hooks = createNoOpHooks() } = opts

  config = await resolveService(config, id, opts)

  if (!config) return

  // WASM services run in-browser — they are not started as child processes
  if (config.__wasm || config.type === 'wasm') return

  const { filepath, monitor = {} } = config

  if (!filepath) return

  if (filepath) {
    const ext = extname(filepath)

    logger.debug('Emitting service:launch:start', { service: label, filepath })
    hooks.emit({ type: 'service:launch:start', service: label, filepath })

    for (let attempt = 0; attempt <= MAX_PORT_RETRIES; attempt++) {
      // On retry, allocate a new port (only if port was auto-allocated)
      if (attempt > 0) {
        if (!config.__portAutoAllocated) break
        const [newPort] = await getFreePorts(1)
        const newUrl = new URL(config.url)
        newUrl.port = newPort.toString()
        config.url = newUrl.href
        logger.debug(
          `[${label}] Retrying with new port ${newPort} (attempt ${attempt + 1}/${MAX_PORT_RETRIES + 1})`
        )
      }

      let childProcess
      let error

      const resolvedURL = new URL(config.url)
      resolvedURL.hostname = config.public ? '0.0.0.0' : resolvedURL.hostname

      try {
        const _cwd = process.cwd()
        const { build, root = _cwd } = opts
        const cwd = build ? _cwd : root

        const mode = build ? 'production' : 'development'
        const userEnv = loadEnvironmentVariables(mode, root)

        // Get service-specific env variables
        const serviceEnv = config.env && typeof config.env === 'object' ? config.env : {}

        // Helper to resolve runtime SSL paths
        function resolveRuntimePath(path: string): string {
          // If path contains runtime marker, resolve it
          if (path.startsWith('__RUNTIME_SSL__/')) {
            const relativePath = path.replace('__RUNTIME_SSL__/', '')

            // In Electron production, resolve from extraResources
            if (typeof process !== 'undefined' && process.resourcesPath) {
              const resolvedPath = resolve(process.resourcesPath, 'ssl', relativePath)
              logger.debug(
                `[${label}] SSL path resolved from resources: ${path} -> ${resolvedPath}`
              )
              return resolvedPath
            }

            // Fallback to original resolution (shouldn't happen)
            const resolvedPath = resolve(root, relativePath)
            logger.debug(`[${label}] SSL path resolved from root: ${path} -> ${resolvedPath}`)
            return resolvedPath
          }

          // In dev mode, paths should already be absolute
          logger.debug(`[${label}] SSL path used as-is: ${path}`)
          return path
        }

        // Add SSL certificate paths to environment if configured
        const sslEnv = config.ssl
          ? {
              SSL_KEY_PATH: resolveRuntimePath(config.ssl.key),
              SSL_CERT_PATH: resolveRuntimePath(config.ssl.cert),
            }
          : {}

        if (config.ssl) {
          logger.debug(`[${label}] SSL configuration:`)
          logger.debug(`  - SSL_KEY_PATH: ${sslEnv.SSL_KEY_PATH}`)
          logger.debug(`  - SSL_CERT_PATH: ${sslEnv.SSL_CERT_PATH}`)
          logger.debug(`  - Key exists: ${existsSync(sslEnv.SSL_KEY_PATH)}`)
          logger.debug(`  - Cert exists: ${existsSync(sslEnv.SSL_CERT_PATH)}`)
        }

        // Share environment variables with the child process
        const env = {
          ...userEnv,
          ...process.env,
          ...serviceEnv,
          ...sslEnv,
          PORT: resolvedURL.port,
          HOST: resolvedURL.hostname,
        }

        const resolvedFilepath = resolve(
          isExecutable(ext) && !ext && existsSync(filepath + '.exe') ? filepath + '.exe' : filepath
        )

        const fileExists = existsSync(resolvedFilepath)

        if (!fileExists) {
          logger.debug('Emitting service:launch:error', {
            service: label,
            filepath: resolvedFilepath,
          })
          return hooks.emit({
            type: 'service:launch:error',
            error: new Error(`File does not exist at ${resolvedFilepath}`),
            service: label,
          })
        }

        // Verify binary integrity when a hash manifest is available
        if (isExecutable(ext) && opts.hashManifest?.[id]) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createHash } = require('node:crypto')
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { readFileSync } = require('node:fs')
          const actual = createHash('sha256').update(readFileSync(resolvedFilepath)).digest('hex')
          if (actual !== opts.hashManifest[id]) {
            hooks.emit({
              type: 'security:service:integrity:fail',
              service: label,
              expected: opts.hashManifest[id],
              actual,
            })
            return hooks.emit({
              type: 'service:launch:error',
              error: new Error(
                `Service binary integrity check failed for ${label}: expected ${opts.hashManifest[id].slice(0, 12)}..., got ${actual.slice(0, 12)}...`
              ),
              service: label,
              filepath: resolvedFilepath,
            })
          }
          hooks.emit({ type: 'security:service:integrity:pass', service: label, hash: actual })
        }

        const baseProcessOptions = {
          cwd,
          env,
          shell: false,
          windowsHide: true,
          detached: false,
        }

        if (jsExtensions.includes(ext)) {
          // Node.js files use fork() which supports IPC channels
          childProcess = fork(resolvedFilepath, [], {
            ...baseProcessOptions,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'] as ('pipe' | 'ipc')[],
            silent: true,
          })
        } else if (ext === '.py') {
          // Python: no IPC channel — native processes don't support Node IPC
          childProcess = spawn('python', [resolvedFilepath], {
            ...baseProcessOptions,
            stdio: ['pipe', 'pipe', 'pipe'] as 'pipe'[],
          })
        } else if (isExecutable(ext)) {
          // Native executables: no IPC channel — passing 'ipc' to spawn() causes zombie processes
          childProcess = spawn(resolvedFilepath, [], {
            ...baseProcessOptions,
            stdio: ['pipe', 'pipe', 'pipe'] as 'pipe'[],
          })
        }
      } catch (e) {
        error = e
      }

      if (!childProcess) {
        logger.debug('Emitting service:launch:error', { service: label, filepath })
        hooks.emit({ type: 'service:launch:error', service: label, filepath, error })
        return
      }

      // Detect startup success vs early exit (port conflict)
      let startupSettled = false
      let resolveStartup: (result: 'success' | 'retry') => void
      const startupPromise = new Promise<'success' | 'retry'>(r => {
        resolveStartup = r
      })

      const settleStartup = (result: 'success' | 'retry') => {
        if (startupSettled) return
        startupSettled = true
        resolveStartup(result)
      }

      const startupTimeout = setTimeout(() => settleStartup('success'), EARLY_EXIT_WINDOW_MS)

      // Attach handlers immediately to avoid missing events
      if (childProcess.stdout && monitor.stdout !== false) {
        childProcess.stdout.on('data', data => {
          if (!startupSettled) {
            clearTimeout(startupTimeout)
            settleStartup('success')
          }

          const wasStarting = !config.status
          config.status = true
          if (opts.onLog) opts.onLog(id, data)
          logger.debug('Emitting service:stdout', { service: label })
          hooks.emit({ type: 'service:stdout', service: label, data })

          // PID verification: on first stdout, verify the spawned PID owns the port
          if (wasStarting && childProcess.pid) {
            const result = verifyPortOwnership(resolvedURL.port, childProcess.pid)
            if (result && !result.match) {
              hooks.emit({
                type: 'security:warning',
                message: `PID mismatch for service "${label}" on port ${resolvedURL.port}: expected ${childProcess.pid}, found ${result.pids.join(', ')}`,
                context: 'pid-verification',
              })
            }
          }
        })
      }

      if (childProcess.stderr && monitor.stderr !== false) {
        childProcess.stderr.on('data', data => {
          logger.debug('Emitting service:stderr', { service: label })
          hooks.emit({ type: 'service:stderr', service: label, data })
        })
      }

      childProcess.on('error', err => {
        clearTimeout(startupTimeout)
        config.status = false
        delete processes[id]
        logger.debug('Emitting service:launch:error (spawn error)', {
          service: label,
          error: err.message,
        })
        hooks.emit({
          type: 'service:launch:error',
          service: label,
          filepath,
          error: new Error(
            `Failed to start service "${label}": ${err.message}${'code' in err && err.code === 'ENOENT' ? `. Ensure the command is available on PATH.` : ''}`
          ),
        })
        settleStartup('retry')
      })

      childProcess.on('close', code => {
        clearTimeout(startupTimeout)
        config.status = false

        if (!startupSettled) {
          // Early exit during startup — don't notify caller yet
          settleStartup(code !== 0 ? 'retry' : 'success')
        } else {
          // Normal runtime exit
          if (opts.onClosed) opts.onClosed(id, code)
          delete processes[id]
          logger.debug('Emitting service:exit', { service: label, code })
          hooks.emit({ type: 'service:exit', service: label, code })
        }
      })

      processes[id] = childProcess

      const startupResult = await startupPromise

      if (startupResult === 'retry') {
        delete processes[id]

        if (config.__portAutoAllocated && attempt < MAX_PORT_RETRIES) {
          config.status = null
          logger.debug(`[${label}] Service exited early (likely port conflict), will retry`)
          continue
        }

        // Exhausted retries or user-specified port — report failure
        logger.debug('Emitting service:launch:error', { service: label, filepath })
        hooks.emit({
          type: 'service:launch:error',
          service: label,
          filepath,
          error: new Error(
            `Service "${label}" exited immediately (possible port conflict on port ${resolvedURL.port})`
          ),
        })
        return
      }

      // Startup succeeded
      logger.debug('Emitting service:launch:complete', {
        service: label,
        url: resolvedURL.href,
        filepath,
      })
      hooks.emit({
        type: 'service:launch:complete',
        service: label,
        url: resolvedURL.href,
        filepath,
      })

      return { ...config, process: childProcess } as ActiveService
    }
  }
}

const KILL_TIMEOUT_MS = 3000

const killProcess = (p): Promise<void> => {
  return new Promise(resolve => {
    if (!p || !p.pid) return resolve()

    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      resolve()
    }

    // Listen for actual exit
    p.once('exit', settle)

    // Send SIGTERM
    try {
      p.kill('SIGTERM')
    } catch (e) {
      console.error(`Failed to kill process ${p.pid}:`, e instanceof Error ? e.message : e)
      return settle()
    }

    // SIGKILL fallback after timeout
    setTimeout(() => {
      if (settled) return
      try {
        p.kill('SIGKILL')
      } catch {
        /* SIGKILL may fail if process already exited */
      }
      // Resolve even if SIGKILL doesn't trigger exit event
      setTimeout(settle, 500)
    }, KILL_TIMEOUT_MS)
  })
}

export async function close(id?: string) {
  // Kill Specific Process
  if (id) {
    if (processes[id]) {
      await killProcess(processes[id])
      delete processes[id]
    } else {
      console.warn(`No process exists with id ${id}`)
    }
  }

  // Kill All Processes
  else {
    await Promise.all(Object.values(processes).map(killProcess))
    processes = {}
  }
}

export const sanitize = (
  services: Record<string, ResolvedService> // NOTE: May not have URL...
) => {
  return Object.entries(services)

    .filter(([_, info]) => info.url || (info as any).__wasm || (info as any).type === 'wasm')

    .reduce((acc, [id, info]) => {
      const capabilities = (info as any).capabilities

      if ((info as any).__wasm || (info as any).type === 'wasm') {
        acc[id] = {
          type: 'wasm',
          url: (info as any).filepath || info.url,
          ...(capabilities ? { capabilities } : {}),
        }
      } else {
        const { url } = info
        acc[id] = {
          url,
          ...(capabilities ? { capabilities } : {}),
        }
      }

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

  // Resolve env functions for all services
  for (const config of Object.values(resolved)) {
    if (config.env && typeof config.env === 'function') {
      config.env = await config.env(resolved)
    }
  }

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

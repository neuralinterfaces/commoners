import { isAbsolute, extname, join, resolve, sep } from "node:path"
import { getFreePorts } from './network.js';

import { spawn, fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ResolvedService } from "../../types.js";

type ServiceOptions = {
  root: string,
  target?: string, // For desktop check
  services?: any, // Truthy
  build?: boolean  // Default: true
}

const chalk = import('chalk').then(m => m.default)

const WINDOWS = process.platform === 'win32'

const globalWorkspacePath = '.commoners'
const globalServiceWorkspacePath = join(globalWorkspacePath, 'services')
const globalTempServiceWorkspacePath = join(globalWorkspacePath, '.temp.services')

const jsExtensions = [ '.js', '.cjs', '.mjs' ]

// Ensure marked for Node.js usage
const precompileExtensions = {
  node: [{ from: '.ts', to: '.cjs' }],
  cpp: [{ from: '.cpp', to: '.exe' }]
}

const autobuildExtensions = {
  node: [...jsExtensions, ...precompileExtensions.node.map(({ from }) => from)],
}

const LOCAL_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0'
] 

const resolvePath = (root, path) => path && (isAbsolute(path) ? path : resolve(root,path))

const isDesktop = (target) => target === 'desktop' || target === 'electron'

const printServiceMessage = async (id, message, type = 'log') => {
  const _chalk = await chalk
  console[type](`${_chalk.bold(_chalk.greenBright(`[${id}]`))} ${message}`)
}

// ------------------------------------ COPIED ---------------------------------------

// NOTE: From core/utils/url.js to remove the need to copy this asset...
export const isValidURL = (s) => {

  if (existsSync(s)) return false

  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};


// ------------------------------------------------------------------------------------
let processes = {}

export const resolveServiceConfiguration = (config) => {
  if (typeof config === 'string') return isValidURL(config) ? { url: config } : { src: config }
  return config
}

const publishKeys = {
  local: 'local',
  remote: 'remote'
}

export function resolveServiceBuildInfo(
  service, 
  name, 
  opts: ServiceOptions
) {

  // MOVED HERE
  const { 
    root, 
    target, 
    services, 
    build: isBuildProcess = true 
  } = opts

  const isServicesOnlyBuild = !!services
  const isDesktopTarget =  isDesktop(target)
  const isLocalMode = !!(isDesktopTarget || isServicesOnlyBuild)

  if (service.__src) return service // Pre-resolved service

  const publishMode = isLocalMode ? 'local' : 'remote'

  const resolved = resolveServiceConfiguration(service)
  const { src: originalSource, ...resolvedWithoutSource } = resolved // Use OG source

  const hasModeSpecificConfig = resolved.publish && typeof resolved.publish === "object" && Object.values(publishKeys).find(key => key in resolved.publish)

  const basePublish = resolveServiceConfiguration(resolved.publish)
  const modePublish = resolveServiceConfiguration((hasModeSpecificConfig && ( resolved.publish[publishMode] )))

  const { local, remote, ...publishConfig } = basePublish || {}

  const blockBuild = hasModeSpecificConfig ? modePublish === false : basePublish === false

  // Reject services that are not published
  if (isBuildProcess && blockBuild && !isServicesOnlyBuild) return // Do not block if only a service
  
  const resolvedPublishConfig = { ...publishConfig }
  Object.assign(resolvedPublishConfig, modePublish) // Overwrite generic features with mode-specific config  

  if (isBuildProcess) Object.assign(resolvedWithoutSource, resolvedPublishConfig) // Merge publish info with general info

  const { build } = resolvedWithoutSource

  const autoBuild = !build && originalSource && autobuildExtensions.node.includes(extname(originalSource))  
  const toCompile = originalSource && Object.values(precompileExtensions).flat().find(({ from }) => originalSource.endsWith(from))
  
  const requiresBuild = autoBuild || toCompile || build
  
  // Assign source and base items to determine filepath
  if (requiresBuild) {

    const buildingProductionVersion = isBuildProcess || build

    // In development mode, compile source files in a temporary directory  
    const outLocation = join(buildingProductionVersion? globalServiceWorkspacePath : globalTempServiceWorkspacePath, name)

    const __compile = toCompile || build

    const { base: publishBase, src: publishSrc } = resolvedPublishConfig

    const isConfigured = publishBase || publishSrc

    Object.assign(resolvedWithoutSource, {
      base: isConfigured ? publishBase : outLocation,
      src: publishSrc ?? ( autoBuild ? (isBuildProcess ? name : `${name}.cjs` ) : ( toCompile ? `compiled${toCompile.to}` : name )), // Use default output name
      __autobuild: autoBuild,
      __compile
    })

  }


  // Adjust filepath to the user-specified output location
  if (requiresBuild) {
    const { base = null, src: outSrc } = resolvedWithoutSource
    resolvedWithoutSource.filepath = join(base ?? '', outSrc)
  }

  // Remove or add extensions based on platform
  if (resolvedWithoutSource.filepath) {
    const fileExtension =  extname(resolvedWithoutSource.filepath)
    if (WINDOWS && !fileExtension) resolvedWithoutSource.filepath += '.exe' // Add .exe (Win)
    else if (!WINDOWS && fileExtension === '.exe') resolvedWithoutSource.filepath = resolvedWithoutSource.filepath.slice(0, -4) // Remove .exe (Unix)
  }

  // For non-service builds, skip builds for non-URLS or if not local mode
  if (!isServicesOnlyBuild) {

    // Ensure remote URLs are treated as such
    const isRemoteUrl = !getLocalUrl(resolvedWithoutSource.url)
    if (isRemoteUrl) return { url: resolvedWithoutSource.url }

    // Only URLs should pass in remote mode
    if (isBuildProcess && !isLocalMode) {
      const { url } = resolvedWithoutSource
      if (!url) return // Reject services that do not have a URL
      return { url }
    }  
  }



  const { src, url, base, filepath, host, port, __autobuild, __compile } = resolvedWithoutSource
  
  // Resolve filepath
  const fullFile = filepath && resolvePath(root, filepath)
  const willBeBuilt = isBuildProcess || __compile || __autobuild
  const file = fullFile && willBeBuilt ? (isDesktopTarget ? fullFile.replace(`app.asar${sep}`, '') : fullFile) : null // Reference correctly from build Electron application
  
  return {
    
    src,
    url,
    build,
    base: base && resolvePath(root, base),
    filepath: file,

    host, 
    port,

    __autobuild,
    __compile
  }

}

function getLocalUrl(url) {
  const _url = new URL(url || `http://localhost`)
  return LOCAL_HOSTS.includes(_url.hostname) ? _url : null
}

async function getServiceUrl(service) {

  const resolved = resolveServiceConfiguration(service)
  const { url, host, port, src } = resolved

  if (!src) return url // Cannot generate URL without source file

  // Only modify URL if a source file is provided
  const _url = getLocalUrl(url)


  if (_url) {
    const resolvedPort = port || (await getFreePorts(1))[0]
    if (!_url.port) _url.port = resolvedPort.toString() // Use the specified port
    if (host && LOCAL_HOSTS.includes(host)) _url.hostname = host // Only use the specified host if it's local

    return _url.href
  }

  return url
}

  export async function resolveService(config, name, opts: ServiceOptions) {

    if (config.__src) return config // Ensures that references are maintained throughout the application

  const { root } = opts

  // Use the URL to determine the appropriate build strategy
  const resolved = resolveServiceConfiguration(config)

  const { src } = resolved


  // Resolve service publish info
  const resolvedForBuild = resolveServiceBuildInfo(
    resolved, 
    name, 
    opts
  )

  if (!resolvedForBuild) return // Reject flagged service
  
  // Return URL only
  const keys = Object.keys(resolvedForBuild)
  const onlyURL = keys.length === 1 && keys[0] === 'url'
  if (onlyURL) return resolvedForBuild

  // Return buildable service
  const { 
    host, 
    port, 
    filepath, 
    base, 
    build, 
    url,
    __src = src && resolve(root, src),
    __compile, 
    __autobuild
  } = resolvedForBuild

  return {

    // For Build Configuration
    filepath: filepath || __src, base, build, // Build Info
    __src,  __compile, __autobuild, // Flags

    // For Client
    url: await getServiceUrl({ src, url, host, port }),

    status: null,

  }

}


const isExecutable = (ext) => ext === '.exe' || !ext

// Create and monitor arbitary processes
export async function start(config, id, opts = {}) {

  const label = id ?? 'commoners-service'

  config = await resolveService(config, id, opts)

  if (!config) return

  const { filepath } = config

  if (!filepath) return

  if (filepath) {
    let childProcess;
    const ext = extname(filepath)

    let error;

    try {

      const { build } = opts
      const root = !build && opts.root
      const cwd = root || process.cwd()

      const url = new URL(config.url)

      const env = { ...process.env, PORT: url.port, HOST: url.hostname }

      const resolvedFilepath = resolve((isExecutable(ext) && !ext && existsSync(filepath + '.exe')) ? filepath + '.exe' : filepath)

      if (!existsSync(resolvedFilepath)) return await printServiceMessage(label, `File does not exist at ${resolvedFilepath}`, 'warn')

      // Node Support
      if (jsExtensions.includes(ext)) childProcess = fork(resolvedFilepath, [], { cwd, silent: true, env })

      // Python Support
      else if (ext === '.py') childProcess = spawn("python", [resolvedFilepath], { cwd, env })

      // Executable Support
      else if (isExecutable(ext)) childProcess = spawn(resolvedFilepath, [], { cwd, env })

    } catch (e) {
      error = e
    }

    if (childProcess) {

      const _chalk = await chalk
      printServiceMessage(label, _chalk.cyanBright(config.url))

      if (childProcess.stdout) childProcess.stdout.on('data', (data) => {
        config.status = true
        if (opts.onLog) opts.onLog(id, data)
        printServiceMessage(label, data)
      });

      if (childProcess.stderr) childProcess.stderr.on('data', (data) => printServiceMessage(label, data, 'error'));

      // Notify of process closure gracefully
      childProcess.on('close', (code) => {
        config.status = false
        if (opts.onClosed) opts.onClosed(id, code)
        delete processes[id]
        if (code !== null) printServiceMessage(label, `Exited with code ${code}`, 'error')
      });

      // process.on('close', (code) => code === null ? console.log(chalk.gray(`Restarting ${label}...`)) : console.error(chalk.red(`[${label}] exited with code ${code}`))); 

      processes[id] = childProcess

      return {
        process: childProcess,
        info: config
      }

    } else {
      await printServiceMessage(label, `Failed to create service from ${filepath}: ${error}`, 'warn')
    }

  }
}

const killProcess = (p) => {
  return p.kill()
}

export function close(id) {

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
    for (let id in processes) killProcess(processes[id])
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

    acc[id] = { 
      url: url && url.replace('0.0.0.0', 'localhost')
    }

    return acc
  }, {})
}

export async function resolveAll(servicesToResolve = {}, opts) {

  const serviceInfo = {}

  const allServices = Object.keys(servicesToResolve)
  const { services } = opts

  let selectedServices;

  const typeOf = typeof services
  if (typeOf === 'string') selectedServices = [ services ]
  else if (typeOf === 'boolean') {
    if (services) selectedServices = allServices
    else selectedServices = []
  } 
  
  else selectedServices = services || allServices


  await Promise.all(selectedServices.map(async (name) => {
    if (!selectedServices.includes(name)) return
    const config = servicesToResolve[name]
    const service = await resolveService(config, name, opts)
    if (!service) return
    serviceInfo[name] = service
  })) // Run sidecars automatically based on the configuration file

  return serviceInfo
}


export async function createAll(services = {}, opts) {

  const resolved = await resolveAll(services, opts)

  await Promise.all(Object.entries(resolved).map(([id, config]) => start(config, id, opts))) // Run sidecars automatically based on the configuration file

  return {
    services: resolved,
    close
  }
}
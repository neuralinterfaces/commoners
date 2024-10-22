import { basename, isAbsolute, dirname, extname, join, resolve, sep } from "node:path"
import { getFreePorts } from './network.js';

import { spawn, fork } from 'node:child_process';
import { existsSync } from 'node:fs';

const chalk = import('chalk').then(m => m.default)


const WINDOWS = process.platform === 'win32'

const globalWorkspacePath = '.commoners'
const globalServiceWorkspacePath = join(globalWorkspacePath, 'services')
const globalTempServiceWorkspacePath = join(globalWorkspacePath, '.temp.services')

const jsExtensions = [ '.js', '.cjs', '.mjs' ]

const precompileExtensions = {
  node: [{ from: '.ts', to: '.cjs' }], // Ensure marked for Node.js usage
  cpp: [{ from: '.cpp', to: '.exe' }]
}

const autobuildExtensions = {
  node: [...jsExtensions, ...precompileExtensions.node.map(({ from }) => from)],
}

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

const resolveServiceConfiguration = (config) => {
  if (typeof config === 'string') config = isValidURL(config) ? { url: config } : { src: config }
  return config
}


export function resolveServicePublishInfo(
  service, 
  name, 
  root, 
  isLocal = true, 
  isBuildProcess = true
) {

  if (service.__src) return service

  // const publishMode = isLocal ? 'local' : 'remote'

  const resolved = resolveServiceConfiguration(service)

  const { src, build, host, port } = resolved

  if (!src) return

  const STATES = {
    publish: resolved.publish,
  }

  const __src = resolvePath(root, src)  // Resolve the original source file path

  const autoBuild = !build && __src && autobuildExtensions.node.includes(extname(__src))
  const toCompile = __src && Object.values(precompileExtensions).flat().find(({ from }) => __src.endsWith(from))

  const OUTPUT_STATES = { 
    filepath : __src, // Always set the original source file path
    __compile: false,
    __autobuild: false
  } 

  // Must explicitly set build to false for autobuild
  if (autoBuild && STATES.publish !== false) {
    const src = (isBuildProcess) ? name : `${name}.js` // Executables are produced during build process
    STATES.publish = { src, base: join(globalServiceWorkspacePath, name) }
    OUTPUT_STATES.__autobuild = true
  }

  const publish = (typeof STATES.publish === 'string' ? { src: STATES.publish } : STATES.publish) ?? null
  const { base = null, src: outSrc } = publish ?? {}

  // Return the configuration unchanged if no file or url
  if (publish) {

      // In development mode, compile source files in a temporary directory
      if (toCompile && !autoBuild) {
        OUTPUT_STATES.filepath = join(globalTempServiceWorkspacePath, name, `compiled${toCompile.to}`)
        OUTPUT_STATES.__compile = true // Pass the top-level build command (if it exists)
      }

      // Otherwise provide the user-defined output location
      else OUTPUT_STATES.filepath = join(base ?? '', outSrc)
  }

  // // Clear filepath for active remote URLs
  // if (usingRemoteURL) delete OUTPUT_STATES.filepath
  

  // Remove or add extensions based on platform
  if (OUTPUT_STATES.filepath) {
    const fileExtension =  extname(OUTPUT_STATES.filepath)
    if (WINDOWS && !fileExtension) OUTPUT_STATES.filepath += '.exe' // Add .exe (Win)
    else if (!WINDOWS && fileExtension === '.exe') OUTPUT_STATES.filepath = OUTPUT_STATES.filepath.slice(0, -4) // Remove .exe (Unix)
  }
    
  return {
    build,
    host,
    port,
    base: resolvePath(root, base),
    publish,
    __src,
    ...OUTPUT_STATES,
    filepath: resolvePath(root, OUTPUT_STATES.filepath) // Resolve full path
  }


}

  export async function resolveService(config, name, opts = {}) {

    if (config.__src) return config // Ensures that references are maintained throughout the application

  const { root, target, services, build: isBuildProcess } = opts

  const isServicesOnlyBuild = services
  const isDesktopTarget =  isDesktop(target)

  // Use the URL to determine the appropriate build strategy
  const isLocalMode = (isDesktopTarget || services)

  const resolved = resolveServiceConfiguration(config)

  // Force build of services that are manually specified
  if (isServicesOnlyBuild) {
    if (resolved.publish === false) delete resolved.publish // Do not block publish step
    if (resolved.url && resolved.src) delete resolved.url // Ensure building source file
  }

  // const publishMode = isLocalMode ? 'local' : 'remote'    
  // const usingRemoteURL = !isLocal && resolved.url?.[publishMode]
  // resolved.url = (typeof resolved.url === 'string' ? resolved.url : resolved.url?.[publishMode])

  const { url } = resolved
  if (isBuildProcess && url) delete resolved.src // Prioritize urls
  const info = resolveServicePublishInfo(resolved, name, root, isLocalMode, isBuildProcess)
  if (!info) return { url } // Only return the URL for this service
  else if (isBuildProcess && !isLocalMode) return // Only URLs should pass in remote mode
  
  const { host = 'localhost', port = (await getFreePorts(1))[0], filepath, base, build, publish, __src, __compile, __autobuild } = info

  if (isBuildProcess && !publish) return // Reject services that are not published
  
  // Provide the file to run
  const willBeBuilt = isBuildProcess || __compile || __autobuild
  const file = filepath && willBeBuilt ? (isDesktopTarget ? filepath.replace(`app.asar${sep}`, '') : filepath) : __src // Reference correctly from build Electron application


  return {
    url: `http://${host}:${port}`, // Always create a URL for local services
    base, 
    filepath: file,
    publish,
    build,
    host,
    port,
    states: null,
    __src,
    __compile,
    __autobuild
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

      if (!existsSync(resolvedFilepath)) return await printServiceMessage(label, `Source file does not exist at ${resolvedFilepath}`, 'warn')

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

      childProcess.on('close', (code) => {
        if (code !== null) {
          config.status = false
          if (opts.onClosed) opts.onClosed(id, code)
          delete processes[id]
          printServiceMessage(label, `Exited with code ${code}`, 'error')
        }
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
      // console.warn(chalk.yellow(`No process exists with id ${id}`))
      console.warn(`No process exists with id ${id}`)
    }
  }

  // Kill All Processes
  else {
    for (let id in processes) killProcess(processes[id])
    processes = {}
  }
}


export const sanitize = (services) => {

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

  const instances = await resolveAll(services, opts)

  await Promise.all(Object.entries(instances).map(([id, config]) => start(config, id, opts))) // Run sidecars automatically based on the configuration file

  return {
    active: instances,
    close
  }
}
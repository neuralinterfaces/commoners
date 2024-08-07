import { basename, isAbsolute, dirname, extname, join, relative, resolve, sep } from "node:path"
import { getFreePorts } from './utils/network.js';

import { spawn, fork } from 'node:child_process';
import { existsSync } from 'node:fs';

const chalk = import('chalk').then(m => m.default)

const globalWorkspacePath = '.commoners'
const globalServiceWorkspacePath = join(globalWorkspacePath, 'services')
const globalTempServiceWorkspacePath = join(globalWorkspacePath, '.temp.services')

const jsExtensions = ['.js', '.cjs', '.mjs']

const precompileExtensions = {
  node: [ { from: '.ts', to: '.cjs' } ], // Ensure marked for Node.js usage
  cpp: [ { from: '.cpp', to: '.exe' } ]
}

const autobuildExtensions = {
    node: [...jsExtensions, ...precompileExtensions.node.map(({ from }) => from)],
}

const isDesktop = (target) => target === 'desktop' || target === 'electron'

const printServiceMessage = async (id, message, type='log') => {
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

const getFilePath = (src, ext) => join(dirname(src), basename(src, extname(src)) + ext)


// ------------------------------------------------------------------------------------
let processes = {}

const resolveConfig = (config) => typeof config === 'string' ? { src: config } : config

const reconcileConfig = (config) => {

  const { src } = config

  // Register url instead of source file
  if (isValidURL(src)) {
    config.url = src
    delete config.src
  }

  return config

}

export async function resolveService (
  config = {}, 
  name,
  opts = {}
) {

  const { 
    root, 
    target,
    build,
    services
  } = opts

  if (config.__resolved) return config // Return the configuration unchanged if no file or url

  const resolvedConfig = resolveConfig(config)

  reconcileConfig(resolvedConfig) // Register url instead of source file

  if (!resolvedConfig.src) return // Return if no associated file or url


  // Use the URL to determine the appropriate build strategy
  const publishMode = (isDesktop(target) || services) ? 'local' : 'remote'
  const isLocalMode = publishMode === 'local'
  

  const ogSrc = resolvedConfig.src
  const __src = isAbsolute(ogSrc) ? ogSrc : join(root, ogSrc)
  Object.assign(resolvedConfig, { __src })

  if (build) {


    
    const { url } = resolvedConfig
    const urlSrc = (typeof url === 'string' ? url : url?.[publishMode]) ??false
    delete resolvedConfig.url

    const buildStep = resolvedConfig.build

    const configurations = [  { src: urlSrc } ]

    // Handle URL source specification
    if (isLocalMode) {
      if (isValidURL(urlSrc)) delete resolvedConfig.build // Avoid building if not included
      else configurations.push(resolveConfig(resolvedConfig.publish) ?? {})
    }

    const mergedConfig = configurations.reduce((acc, config) => Object.assign(acc, config), { src: false })
    
    const autoBuild = !buildStep && __src && autobuildExtensions.node.includes(extname(__src))
    if (autoBuild && mergedConfig.src === false) delete mergedConfig.src
    
    // Cascade from more to less specific information
    Object.assign(resolvedConfig, mergedConfig)

    // Define default build command
    if ( autoBuild ) {
      const outDir = relative(process.cwd(), join(root, globalServiceWorkspacePath))
      resolvedConfig.build =  { src: name, outDir: join(outDir, name) } // Combine these to get the build path
    }
  }

  // Do not run build commands in development mode
  else {
    delete resolvedConfig.build
  }
  

  let { src } = resolvedConfig

  reconcileConfig(resolvedConfig) // Assign the correct URL for this build
  
  if (!isValidURL(src)) {

    if (build) {
      if (!isLocalMode) return  // Reject the service if not a URL on Web / Mobile
    } 
    
    else delete resolvedConfig.url

  }
  
  if (!src) return resolvedConfig // Return the configuration unchanged if no file or url

  // NOTE: Base must be contained in project root
  if (resolvedConfig.base) src = join(resolvedConfig.base, src) // Resolve relative paths
    
  // Remove or add extensions based on platform
  if (process.platform === 'win32') {
    if (!extname(src)) src += '.exe' // Add .exe (Win)
  }
  else if (extname(src) === '.exe') src = src.slice(0, -4) // Remove .exe (Unix)


  // Resolve the source filepath
  if (!isValidURL(src)) {

    const { outDir, src: outSrc } = resolvedConfig.build ?? {}

    // Correct for Electron build process
    const resolvedBase = (outDir ?? root).replace(`app.asar${sep}`, '')
    const extraResourcesPath = outDir ? join(resolvedBase, outSrc ?? '') : join(resolvedBase, src) 


    resolvedConfig.filepath = __src

    if (build && isDesktop(target)) resolvedConfig.filepath = resolve(extraResourcesPath)

    const { filepath } = resolvedConfig

    // Resolve bundled JS / TS files (assets.ts)
    const precompilationInfo = Object.values(precompileExtensions).flat().find(({ from }) => existsSync(getFilePath(filepath, from)))

    if (precompilationInfo) {
      const outDir = join(root, globalTempServiceWorkspacePath)
      resolvedConfig.filepath = join(outDir, name, `compiled${precompilationInfo.to}`)
      resolvedConfig.compile = resolvedConfig.build ?? true // Pass the top-level build command (if it exists)
    }

  }

  // Always create a URL for local services
  if (!resolvedConfig.url) {
    if (!resolvedConfig.host)  resolvedConfig.host = 'localhost'
    if (!resolvedConfig.port) resolvedConfig.port = (await getFreePorts(1))[0]
    resolvedConfig.url = `http://${resolvedConfig.host}:${resolvedConfig.port}`
  } else {
    const url = new URL(resolvedConfig.url)
    resolvedConfig.host = url.hostname
    resolvedConfig.port = url.port
  }

  resolvedConfig.src = src

  resolvedConfig.status = null

  Object.defineProperty(resolvedConfig, '__resolved', { value: true })
  
  return resolvedConfig

}

// Create and monitor arbitary processes
export async function start (config, id, opts = {}) {

  const label = id ?? 'commoners-service'

  config = await resolveService(config, id, opts)

  if (!config) return

  const { src, filepath, build } = config

  if (isValidURL(src)) return

  if (filepath) {
    let childProcess;
    const ext = extname(filepath)

    let error;

    try {

      const { build } = opts
      const root = !build && opts.root
      const cwd = root || process.cwd()

      const env = { ...process.env, PORT: config.port, HOST: config.host }

      const resolvedFilepath = resolve(filepath)

      if (!existsSync(resolvedFilepath)) return await printServiceMessage(label, `Source file does not exist at ${resolvedFilepath}`, 'warn')

      // Node Support
      if (jsExtensions.includes(ext)) childProcess = fork(resolvedFilepath, [ ], { cwd, silent: true, env })

      // Python Support
      else if (ext === '.py') childProcess = spawn("python", [ resolvedFilepath ], { cwd, env })

      // C++ Support
      else if (ext === '.cpp') {

        // const root = opts.root ?? process.cwd()

        // const relFilePath = relative(root, filepath)
        // const outPath = join(root, globalTempServiceWorkspacePath, dirname(relFilePath), 'compiled.exe')
        // const outDir = dirname(outPath)

        // mkdirSync(outDir, { recursive: true })
        // execSync(build.replace('{out}', outPath).replace('{src}', filepath)) // Compile C++ file. Will be deleted on exit

        // Run compiled file
        childProcess = spawn(resolvedFilepath, [], { cwd, env })
      }
      else if (!ext || ext === '.exe') childProcess = spawn(resolvedFilepath, [], { cwd, env })
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

export function close (id) {

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

function isValidService(info) {
  return info.src || info.url
}

export function sanitize(services) {
  const propsToInclude = [ 'url', 'filepath' ]
  const info = {} 
  Object.entries(services).forEach(([id, sInfo]) => {
    if (!isValidService(sInfo)) return
    const gInfo = info[id] = {}
    propsToInclude.forEach(prop => gInfo[prop] = sInfo[prop])
  })

  return info
}

export async function resolveAll (services = {}, opts) {

  const configs = Object.entries(services).map(([id, config]) =>  [id, (typeof config === 'string') ? { src: config } : config])
  const serviceInfo = {}

  await Promise.all(configs.map(async ([id, config]) => {
    const service = await resolveService(config, id, opts)
    if (!service) return
    serviceInfo[id] = service
  })) // Run sidecars automatically based on the configuration file

  return serviceInfo
}


export async function createAll(services = {}, opts){

  const instances = await resolveAll(services, opts)

  await Promise.all(Object.entries(instances).map(([id, config]) => start(config, id, opts))) // Run sidecars automatically based on the configuration file

  return {
    active: instances,
    close
  }
}
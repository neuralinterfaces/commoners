import node from './node/index.js'
import python from './python/index.js'

import { basename, dirname, extname, join, parse, relative, resolve, sep } from "node:path"
import { getFreePorts } from './utils/network.js';

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const autoBundleExtension = {
  node: [ '.ts' ]
}

const autobuildExtensions = {
    node: ['.js', '.cjs', '.mjs', ...autoBundleExtension.node]
}

// ------------------------------------ COPIED ---------------------------------------

// NOTE: From core/utils/url.js to remove the need to copy this asset...
export const isValidURL = (s) => {
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

export const handlers = {
    node,
    python
}


function resolveConfig(config) {
  return typeof config === 'string' ? { src: config } : config
}


const globalWorkspacePath = '.commoners'
const globalServiceWorkspacePath = join(globalWorkspacePath, 'services')

// Ensure source is detected as local for all conditions
export function isLocal(publishConfig) {
  return !!(publishConfig.local || (!isValidURL(publishConfig.src) && !publishConfig.remote))
}


const isPublished = !process.env.VITE_DEV_SERVER_URL

export async function resolveService (
  config = {}, 
  name,
  opts = {}
) {

  const { 
    root, 
    mode
  } = opts

  if (config.__resolved) return config // Return the configuration unchanged if no file or url

  const resolvedConfig = resolveConfig(config)

  if (mode) {
    
    const publishConfig = resolveConfig(resolvedConfig.publish) ?? {}
    const internalConfig = resolveConfig(resolvedConfig.publish?.[mode]) ?? {} // Block service if mode is not available

    const __src = resolvedConfig.src

    const mergedConfig = Object.assign(Object.assign({ src: false}, publishConfig), internalConfig)

    const autoBuild = !mergedConfig.build && __src && autobuildExtensions.node.includes(extname(__src))
    if (autoBuild && mergedConfig.src === false) delete mergedConfig.src
    
    // Cascade from more to less specific information
    Object.assign(resolvedConfig, mergedConfig)

    // Define default build command
    if ( autoBuild ) {

      const outDir = relative(process.cwd(), join(root, globalServiceWorkspacePath))

        const out = join(outDir, name)

        resolvedConfig.build =  {
          src: join(root, __src),
          out
        }

        if (isLocal(publishConfig)) {
          const src =  join(out, name)
          resolvedConfig.src = isPublished ? relative(root, src) : src
        }

    }

    Object.assign(resolvedConfig, { __src: join(root, __src) })

    delete resolvedConfig.publish
    delete resolvedConfig.remote
  }

  let { src } = resolvedConfig

  if (isValidURL(src)) {
    resolvedConfig.url = src
    delete resolvedConfig.src
  }
  
  if (!src) return resolvedConfig // Return the configuration unchanged if no file or url

  // NOTE: Base must be contained in project root
  if (resolvedConfig.base) src = join(resolvedConfig.base, src) // Resolve relative paths


  // Remove or add extensions based on platform
  if (process.platform === 'win32') {
    if (!extname(src)) src += '.exe' // Add .exe (Win)
  }
  else if (extname(src) === '.exe') src = src.slice(0, -4) // Remove .exe (Unix)

  // Correct for Electron build process
  const extraResourcesPath = join(root.replace(`app.asar${sep}`, ''), src)

  // Choose the resolved filepath
  const filepath = resolvedConfig.filepath = existsSync(extraResourcesPath) ? resolve(extraResourcesPath) : join(root, src)

  // Correct for future autobundling (assets.ts)
  const bundleExt = autoBundleExtension.node.find(ext => existsSync(getFilePath(filepath, ext)))

  if (bundleExt) {
    const relPath = relative(root, filepath)
    const outDir = join(root, globalWorkspacePath, '.temp.services')
    resolvedConfig.filepath = join(outDir, dirname(relPath), `${parse(filepath).name}.js`)
    resolvedConfig.bundle = true
  }

  // Always create a URL for local services
  if (!resolvedConfig.host)  resolvedConfig.host = 'localhost'
  if (!resolvedConfig.port) resolvedConfig.port = (await getFreePorts(1))[0]
  if (!resolvedConfig.url) resolvedConfig.url = `http://localhost:${resolvedConfig.port}`

  resolvedConfig.src = src

  resolvedConfig.status = null

  Object.defineProperty(resolvedConfig, '__resolved', { value: true })
  
  return config

}

// Create and monitor arbitary processes
export async function start (config, id, opts = {}) {

  config = await resolveService(config, id, opts)

  const { src, filepath } = config

  if (isValidURL(src)) return

  if (filepath) {
    let childProcess;
    const ext = extname(filepath)

    let error;

    try {
      const env = { ...process.env, PORT: config.port, HOST: config.host }
      if (ext === '.js') childProcess = node(filepath, env)
      else if (ext === '.py') childProcess = python(filepath, env)
      else if (!ext || ext === '.exe') childProcess = spawn(filepath, [], { env })
    } catch (e) {
      error = e
    }
    
    if (childProcess) {
      const label = id ?? 'commoners-service'
      if (childProcess.stdout) childProcess.stdout.on('data', (data) => {
        config.status = true
        if (opts.onLog) opts.onLog(id, data)
        console.log(`[${label}]: ${data}`)
      });
      if (childProcess.stderr) childProcess.stderr.on('data', (data) => console.error(`[${label}]: ${data}`));
      childProcess.on('close', (code) => {
        if (code !== null) {
          config.status = false
          if (opts.onClosed) opts.onClosed(id, code)
          delete processes[id]
          console.error(`[${label}]: exited with code ${code}`)
        }
      }); 
      // process.on('close', (code) => code === null ? console.log(chalk.gray(`Restarting ${label}...`)) : console.error(chalk.red(`[${label}]: exited with code ${code}`))); 
      processes[id] = childProcess

      return {
        process: childProcess,
        info: config
      }

    } else {
      console.warn(`Cannot create the ${id} service from a ${ext ?? 'executable'} file...`, error)
    }

  }
}

const killProcess = (p) => p.kill()

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

  await Promise.all(configs.map(async ([id, config]) => serviceInfo[id] = await resolveService(config, id, opts))) // Run sidecars automatically based on the configuration file

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
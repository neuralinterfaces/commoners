import node from './node/index.js'
import python from './python/index.js'

import { extname, join, sep } from "node:path"
import { getFreePorts } from './utils/network.js';

import { spawn } from 'node:child_process';

const autobuildExtensions = {
    node: ['.js', '.cjs', '.mjs', '.ts']
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

// ------------------------------------------------------------------------------------
let processes = {}

export const handlers = {
    node,
    python
}


function resolveConfig(config) {
  return typeof config === 'string' ? { src: config } : config
}


export async function resolveService (
  config = {}, 
  name,
  { assets, root } = {}
) {


  const productionMode = process.env.COMMONERS_MODE

  const resolvedConfig = resolveConfig(config)

  if (productionMode && resolvedConfig.publish) {
    const publishConfig = resolveConfig(resolvedConfig.publish) ?? {}
    const internalConfig = resolveConfig(resolvedConfig.publish[productionMode]) ?? {} // Block service if mode is not available

    const __src = resolvedConfig.src

    // Ensure source is detected as local for all conditions
    const isLocalSrc = publishConfig.local || (!isValidURL(publishConfig.src) && !publishConfig.remote)

    const mergedConfig = Object.assign(Object.assign({ src: false }, publishConfig), internalConfig)
    
    // Cascade from more to less specific information
    Object.assign(resolvedConfig, mergedConfig)

    // Define default build command
    if (!resolvedConfig.build && __src && isLocalSrc && autobuildExtensions.node.includes(extname(__src))) {
        const pkgOut = `./${join('.commoners', 'services', name)}`
        const rollupOut = `./${join('.commoners', 'services', name, `${name}.js`)}`
        resolvedConfig.build =  `rollup ${__src} -o ${rollupOut} --format cjs && pkg ${rollupOut} --target node16 --out-path ${pkgOut}`
        resolvedConfig.src = pkgOut      
    }

    delete resolvedConfig.publish
    delete resolvedConfig.local
    delete resolvedConfig.remote
  }

  const  { src } = resolvedConfig

  if (isValidURL(src)) {
    resolvedConfig.url = src
    delete resolvedConfig.src
  }
  
  if (!resolvedConfig.src) return resolvedConfig // Return the configuration unchanged if no file or url


  if (src.endsWith('.ts')) resolvedConfig.src = src.slice(0, -2) + 'js' // Load transpiled file


  // Transform the src into an absolute path if not a dist
  const isInDist = resolvedConfig.src.includes(`${sep}dist${sep}`) // NOTE: Assuming outDir is always dist...

  const base =  (isInDist ? root : assets) || assets
  if (base) resolvedConfig.abspath = join(base, resolvedConfig.src) // Expose the absolute path of the file in development mode
  else resolvedConfig.abspath = resolvedConfig.src // Just use the raw sourcde

    // Always create a URL for local services
  if (!resolvedConfig.host)  resolvedConfig.host = 'localhost'
  if (!resolvedConfig.port) resolvedConfig.port = (await getFreePorts(1))[0]
  if (!resolvedConfig.url) resolvedConfig.url = `http://localhost:${resolvedConfig.port}`
  
  return config

}

// Create and monitor arbitary processes
export async function start (config, id, roots) {

  config = await resolveService(config, id, roots)

  const { src } = config

  if (isValidURL(src)) return

  if (src) {
    let childProcess;
    const ext = extname(src)

    if (ext === '.js') childProcess = node(config)
    else if (ext === '.py') childProcess = python(config)
    else if (!ext || ext === '.exe') childProcess = spawn(config.abspath, [], { env: { ...process.env, PORT: config.port, HOST: config.host } }) // Run executables as extra resources

    if (childProcess) {
      const label = id ?? 'commoners-service'
      if (childProcess.stdout) childProcess.stdout.on('data', (data) => console.log(`[${label}]: ${data}`));
      if (childProcess.stderr) childProcess.stderr.on('data', (data) => console.error(`[${label}]: ${data}`));
      childProcess.on('close', (code) => code === null 
                                      ? '' // Process is being closed because of a window closure from the user or the Vite HMR process
                                      : console.error(`[${label}]: exited with code ${code}`)); 
      // process.on('close', (code) => code === null ? console.log(chalk.gray(`Restarting ${label}...`)) : console.error(chalk.red(`[${label}]: exited with code ${code}`))); 
      processes[id] = childProcess

      return {
        process: childProcess,
        info: config
      }
    } else {
      console.warn(`Cannot create the ${id} service from a ${ext} file...`)
      // console.warn(chalk.yellow(`Cannot create services from files with a ${ext} extension...`))
    }

  }
}

const killProcess = (p) => p.kill()

export function stop (id) {

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
  const propsToInclude = [ 'url' ]
  const info = {} 
  Object.entries(services).forEach(([id, sInfo]) => {
    if (!isValidService(sInfo)) return
    const gInfo = info[id] = {}
    propsToInclude.forEach(prop => gInfo[prop] = sInfo[prop])
  })

  return info
}

export async function resolveAll (services = {}, roots) {

  const configs = Object.entries(services).map(([id, config]) =>  [id, (typeof config === 'string') ? { src: config } : config])
  const serviceInfo = {}

  await Promise.all(configs.map(async ([id, config]) => serviceInfo[id] = await resolveService(config, id, roots))) // Run sidecars automatically based on the configuration file

  return serviceInfo
}


export async function createAll(services = {}, roots){
  services = await resolveAll(services, roots)
  await Promise.all(Object.entries(services).map(([id, config]) => start(config, id, roots))) // Run sidecars automatically based on the configuration file
  return services
}
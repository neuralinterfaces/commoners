import node from './node/index.js'
import python from './python/index.js'

import { extname, join } from "node:path"
import { getFreePorts, localIP } from './utils/network.js';

import { spawn } from 'node:child_process';

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


export async function resolveService (config = {}, assets = join(process.cwd(), 'dist', '.commoners', 'assets')) {

  const mode = process.env.MODE
  const isProduction = mode !== "development"


  if (isProduction && config.publish) {
    const publishConfig = resolveConfig(config.publish)
    const internalConfig = resolveConfig(config.publish[mode]) ?? publishConfig
    const { src } = internalConfig

  // Back out to the app resource section (where Electron production runs will target)
    if (src && !('COMMAND' in process.env) && process.env.MODE === 'local' && process.env.TARGET === 'desktop') internalConfig.src = join('..', '..', '..', '..', src)

    // Cascade from more to less specific information
    Object.assign(config, config.publish)
    Object.assign(config, internalConfig)

    delete config.publish
  }

  const { src } = resolveConfig(config)

  if (isValidURL(src)) {
    config.url = src
    delete config.src
    return config // Abort properly when a url
  }

  if (!src) return config // Return the configuration unchanged if no file or url


  if (src.endsWith('.ts')) config.src = src.slice(0, -2) + 'js' // Load transpiled file
  config.abspath = join(assets, config.src) // Expose the absolute path of the file in development mode

  if (!config.port) config.port = (await getFreePorts(1))[0]

  config.url = `${config.protocol ?? `http:`}//${localIP}:${config.port}`

  return config

}

// Create and monitor arbitary processes
export async function start (config, id, assets) {

  config = await resolveService(config, assets)

  const { src } = config

  if (isValidURL(src)) return

  if (src) {
    let process;
    const ext = extname(src)

    if (ext === '.js') process = node(config)
    else if (ext === '.py') process = python(config)
    else if (!ext || ext === '.exe') process = spawn(config.abspath, [config.port]) // Run executables as extra resources

    if (process) {
      const label = id ?? 'commoners-service'
      if (process.stdout) process.stdout.on('data', (data) => console.log(`[${label}]: ${data}`));
      if (process.stderr) process.stderr.on('data', (data) => console.error(`[${label}]: ${data}`));
      process.on('close', (code) => code === null 
                                      ? '' // Process is being closed because of a window closure from the user or the Vite HMR process
                                      : console.error(`[${label}]: exited with code ${code}`)); 
      // process.on('close', (code) => code === null ? console.log(chalk.gray(`Restarting ${label}...`)) : console.error(chalk.red(`[${label}]: exited with code ${code}`))); 
      processes[id] = process

      return {
        process,
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

export async function resolveAll (services = {}, assets) {

  const configs = Object.entries(services).map(([id, config]) =>  [id, (typeof config === 'string') ? { src: config } : config])
  const serviceInfo = {}

  await Promise.all(configs.map(async ([id, config]) => serviceInfo[id] = await resolveService(config, assets))) // Run sidecars automatically based on the configuration file

  // Provide sanitized service information as an environment variable
  const propsToInclude = [ 'url' ]
  const info = {} 
  for (let id in serviceInfo) {
    info[id] = {}
    propsToInclude.forEach(prop => info[id][prop] = serviceInfo[id][prop])
  }

  process.env.SERVICES = JSON.stringify(info)

  return serviceInfo
}


export async function createAll(services = {}, assets){
  services = await resolveAll(services, assets)
  await Promise.all(Object.entries(services).map(([id, config]) => start(config, id, assets))) // Run sidecars automatically based on the configuration file
  return services
}
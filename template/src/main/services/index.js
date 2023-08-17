import node from './node/index.js'
import python from './python/index.js'

import { extname, join } from "node:path"
import { getFreePorts } from './utils/network.js';
import { isValidURL } from '../../../../packages/utilities/url.js';
import { spawn } from 'node:child_process';

let processes = {}

export const handlers = {
    node,
    python
}


function resolveSource(config) {
  return typeof config === 'string' ? config : config?.src
}


export async function resolveService (config = {}, assets = join(process.cwd(), 'dist', '.commoners', 'assets')) {

  const isProduction = process.env.COMMONERS_MODE !== "dev"

  const { src } = config

  if (isValidURL(src)) return config // Abort properly when a url

  if (!src) return config // Return the configuration unchanged if no file or url

  if (isProduction && config.production) {
    const src = resolveSource(config.production[process.env.COMMONERS_MODE]) ?? esolveSource(config.production.src) ?? {}
    if (src) config.production.src = join('..', '..', '..', '..', src) // Back out to the app resource section (where production builds will live)
    Object.assign(config, config.production)
    delete config.production
  }

  if (!config.port) config.port = (await getFreePorts(1))[0]
  config.url = `${config.protocol ?? `http:`}//${config.hostname ?? `127.0.0.1`}:${config.port}`

  if (src.endsWith('.ts')) config.src = src.slice(0, -2) + 'js' // Load transpiled file
  config.abspath = join(assets, config.src) // Find file in assets

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
      const label = id ? `commoners-${id}-service` : 'commoners-service'
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

  process.env.COMMONERS_SERVICES = JSON.stringify(info)

  return serviceInfo
}


export async function createAll(services = {}, assets){
  services = await resolveAll(services, assets)
  await Promise.all(Object.entries(services).map(([id, config]) => start(config, id, assets))) // Run sidecars automatically based on the configuration file
  return services
}
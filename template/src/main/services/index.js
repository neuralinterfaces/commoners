import node from './node/index.js'
import python from './python/index.js'

import { extname, resolve } from "path"
import { commonersAssets } from "./utils/globals.js"
import { getFreePorts } from './utils/network.js';

let processes = {}

export const handlers = {
    node,
    python
}

export async function resolveService (config = {}) {
  const { file } = config

  if (file.endsWith('.ts')) config.file = file.slice(0, -2) + 'js' // Load transpiled file

  config.abspath = resolve(commonersAssets, config.file) // Find file in assets

  if (!config.port) {
    const [ port ] = await getFreePorts(1)
    config.port = port
  }

  return config

}

// Create and monitor arbitary  processes
export async function start (config, id) {

  config = await resolveService(config)

  let process;
  const ext = extname(config.file)

  if (ext === '.js') process = node(config)
  else if (ext === '.py') process = python(config) // NOTE: Python should use actual file

  if (process) {
    const label = id ? `commoners-${id}-service` : 'commoners-service'
    if (process.stdout) process.stdout.on('data', (data) => console.log(`[${label}]: ${data}`));
    if (process.stderr) process.stderr.on('data', (data) => console.error(`[${label}]: ${data}`));
    process.on('close', (code) => code === null ? console.log(`Restarting ${label}...`) : console.error(`[${label}]: exited with code ${code}`)); 
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


export function stop (id) {

    // Kill Specific Process
    if (id) {
        if (processes[id]) {
            processes[id].kill()
            delete processes[id]
        } else {
          // console.warn(chalk.yellow(`No process exists with id ${id}`))
            console.warn(`No process exists with id ${id}`)
        }
    } 
    
    // Kill All Processes
    else {
        for (let id in processes) processes[id].kill()
        processes = {}
    }
}

export async function resolveAll (services = {}) {

  const configs = Object.entries(services).map(([id, config]) =>  [id, (typeof config === 'string') ? { file: config } : config])
  const serviceInfo = {}

  await Promise.all(configs.map(async ([id, config]) => serviceInfo[id] = await resolveService(config))) // Run sidecars automatically based on the configuration file

  const propsToInclude = [ 'port' ]
  const info = {} 
  for (let id in serviceInfo) {
    info[id] = {}
    propsToInclude.forEach(prop => {
      info[id][prop] = serviceInfo[id][prop]
    })
  }

  process.env.COMMONERS_SERVICES = JSON.stringify(info)
  return serviceInfo
}


export async function createAll(services = {}){
  services = await resolveAll(services)
  await Promise.all(Object.entries(services).map(([id, config]) => start(config, id))) // Run sidecars automatically based on the configuration file
  return services
}
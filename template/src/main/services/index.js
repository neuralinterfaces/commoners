import node from './node/index.js'
import python from './python/index.js'

import { extname, join, resolve } from "path"
import { getFreePorts } from './utils/network.js';
import { isValidURL } from '../../../../packages/cli/src/url.js';

let processes = {}

export const handlers = {
    node,
    python
}

export async function resolveService (config = {}, assets = join(process.cwd(), 'dist', '.commoners', 'assets')) {
  const { file } = config

  // Return the configuration unchanged
  if (!file) return config

  // Specify the file property as a url
  else if (isValidURL(file)) {
    config.url = config.file
    delete config.file
    return config
  }

  if (file.endsWith('.ts')) config.file = file.slice(0, -2) + 'js' // Load transpiled file

  config.abspath = resolve(assets, config.file) // Find file in assets

  if (!config.port) {
    const [ port ] = await getFreePorts(1)
    config.port = port
  }

  if (!config.protocol) config.protocol = `http:`
  if (!config.hostname) config.hostname = `127.0.0.1`

  config.url = `${config.protocol}//${config.hostname}:${config.port}`

  return config

}

// Create and monitor arbitary  processes
export async function start (config, id, assets) {

  config = await resolveService(config, assets)

  if (config.file) {
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

export async function resolveAll (services = {}, assets) {

  const configs = Object.entries(services).map(([id, config]) =>  [id, (typeof config === 'string') ? { file: config } : config])
  const serviceInfo = {}

  await Promise.all(configs.map(async ([id, config]) => serviceInfo[id] = await resolveService(config, assets))) // Run sidecars automatically based on the configuration file

  const propsToInclude = [ 'url', 'protocol', 'hostname', 'port' ]
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
  await Promise.all(Object.entries(services).map(([id, config]) => start(config, id))) // Run sidecars automatically based on the configuration file
  return services
}
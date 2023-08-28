import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { join } from 'node:path'

// Load preload the configuration file
const commonersDist = join(__dirname, '..')
const configFileName = 'commoners.config.js'
const configPath = join(commonersDist, 'assets', configFileName)
const config = require(configPath).default ?? {}

// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));


config.plugins = new Promise(async (resolve, reject) => {

  const loaded = {}
  const __toRender = {}
  const { plugins } = config


  if (plugins) {
    try {

      const supported = await asyncFilter(plugins, async (plugin) => {
        let { isSupported } = plugin

        try {
          if (isSupported && typeof isSupported === 'object') isSupported = isSupported['desktop']
          return (typeof isSupported === 'function') ? await plugin.isSupported('desktop') : isSupported !== false
        } catch {
          return false
        }
      })

      supported.forEach(({ name, preload }) => {

        loaded[name] = undefined // Register that all supported plugins are technically loaded
        if (preload) loaded[name] = preload.call(ipcRenderer)

      })

      supported.forEach(({ name, render }) => {
        if (render) __toRender[name] = render
      })
    } catch (e) {
      reject(e)
    }
  }

  resolve(config.plugins = { loaded, __toRender })
})

// Assign sanitized services to the global object
if (config.services) {
  const services = process.env.COMMONERS_SERVICES
  if (services) config.services = JSON.parse(services)
}


// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('COMMONERS', config)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI

  // @ts-ignore (define in dts)
  window.COMMONERS = config
}

["log", "warn", "error"].forEach((method) => ipcRenderer.on(`console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));

import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'

import { join } from 'node:path'

import { sanitizePluginProperties } from './utils/plugins'

// Load preload the configuration file
const commonersDist = join(__dirname, '..')
const configFileName = 'commoners.config.js'
const configPath = join(commonersDist, 'assets', configFileName)

// NOTE: This is an independent instance of the configuration object
const globalObject = require(configPath).default ?? {}

// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));

// Assign sanitized services to the global object
const services = process.env.SERVICES
if (services) globalObject.services = JSON.parse(services)

// Add globals to the object
globalObject.TARGET = process.env.TARGET 
globalObject.MODE =  process.env.MODE

// Define global COMMONERS object for the resolution of preload plugins
// @ts-ignore (define in dts)
window.COMMONERS = globalObject


globalObject.plugins = new Promise(async (resolve, reject) => {

  const loaded = {}
  const __toRender = {}
  const { plugins } = globalObject

  const env = { TARGET: 'desktop' }


  if (plugins) {
    try {

      const supported = await asyncFilter(plugins, async (plugin) => {
        let { isSupported } = plugin

        try {
          if (isSupported && typeof isSupported === 'object') isSupported = isSupported[env.TARGET]
          return (typeof isSupported === 'function') ? await plugin.isSupported(env.TARGET) : isSupported !== false
        } catch {
          return false
        }
      })

      const sanitized = supported.map(o => sanitizePluginProperties(o, env.TARGET))

      sanitized.forEach(({ name, preload }) => {

        loaded[name] = undefined // Register that all supported plugins are technically loaded
        if (preload) loaded[name] = preload.call(ipcRenderer)

      })

      sanitized.forEach(({ name, render }) => {
        if (render) __toRender[name] = render
      })
    } catch (e) {
      reject(e)
    }
  }

  globalObject.plugins = { loaded, __toRender } 

  // Expose COMMONERS as a global object in the main script
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('COMMONERS', globalObject)
    } catch (error) {
      console.error(error)
    }
  }

  resolve(globalObject.plugins = { loaded, __toRender })
});


// Proxy console methods from the main process
["log", "warn", "error"].forEach((method) => ipcRenderer.on(`console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));

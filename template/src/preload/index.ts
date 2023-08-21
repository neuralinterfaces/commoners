import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { join } from 'node:path'

// Load preload the configuration file
const commonersDist = join(__dirname, '..')
const configFileName = 'commoners.config.js'
const configPath = join(commonersDist, 'assets', configFileName)
const config = require(configPath).default ?? {}

// // Inject the configuration file (with activated options) into the Electron context
if (config.plugins) {
    const loaded = config.plugins.reduce((acc, { name, preload }) => {
      if (preload) acc[name] = preload.call(ipcRenderer)
      return acc
    }, {})

    const __toRender = config.plugins.reduce((acc, { name, renderer }) => {
      if (renderer) acc[name] = renderer
      return acc
    }, {})

    config.plugins = {
      loaded,
      __toRender,
    }
}

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
    contextBridge.exposeInMainWorld('commoners', config)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI

  // @ts-ignore (define in dts)
  window.commoners = config
}

["log", "warn", "error"].forEach((method) => ipcRenderer.on(`console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));

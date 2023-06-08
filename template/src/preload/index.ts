import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { join } from 'node:path'

import plugins from '../../../plugins/index'

// Load preload the configuration file
const commonersDist = join(__dirname, '..')
const configFileName = 'commoners.config.js'
const configPath = join(commonersDist, 'assets', configFileName)
const config = require(configPath).default ?? {}

// Inject the configuration file (with activated options) into the Electron context
if (config.plugins) config.plugins = plugins.reduce((acc, { name, preload }) => {
  if (preload && config.plugins?.[name]) acc[name] = preload.call(ipcRenderer)
  return acc
}, {})

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


import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { join } from 'path'

import plugins from '../../../plugins/index'

// Load preload the configuration file
const commonersDist = join(__dirname, '..')
const configFileName = 'commoners.config.js'
const configPath = join(commonersDist, 'assets', configFileName)
const config = require(configPath).default

// Custom APIs for renderer
const api = {
  config,
  plugins: plugins.reduce((acc, { name, preload }) => {
    if (preload) acc[name] = preload.call(ipcRenderer)
    return acc
  }, {})
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('commoners', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
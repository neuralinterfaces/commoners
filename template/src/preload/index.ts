import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'

const globalVariableName = '__COMMONERS'
const services = process.env.SERVICES

const TEMP_COMMONERS = { 
    services: services ? JSON.parse(services) : null, // Ensure correct ports
    ipcRenderer: {
        on: (...args) => ipcRenderer.on(...args),
        send: (...args) => ipcRenderer.send(...args)
    }
}

// Expose ipcRenderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld(globalVariableName, TEMP_COMMONERS)
  } catch (error) {
    console.error(error)
  }
} else {
  globalThis[globalVariableName] = TEMP_COMMONERS
}

// Proxy console methods from the main process
["log", "warn", "error"].forEach((method) => ipcRenderer.on(`console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));

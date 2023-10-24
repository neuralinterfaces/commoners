import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'

const globalVariableName = '__COMMONERS'
const services = process.env.COMMONERS_SERVICES

const on = (channel, listener) => ipcRenderer.on(channel, listener)

const TEMP_COMMONERS = { 
    services: services ? JSON.parse(services) : null, // Ensure correct ports
    ipcRenderer: {
        on,
        send: (channel, ...args) => ipcRenderer.send(channel, ...args)
    }
}

for (let name in TEMP_COMMONERS.services) {
    const service = TEMP_COMMONERS.services[name]
    service.onLog = (listener) => on(`service:${name}:log`, (_, msg) => {
      listener(msg)
      service.logged = true
    })
    service.onClose = (listener) => on(`service:${name}:close`, (_, code) => {
      service.closed = true
      listener(code)
    })
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
["log", "warn", "error"].forEach((method) => ipcRenderer.on(`COMMONERS:console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));


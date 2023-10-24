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

    const listeners = {
        active: [],
        closed: []
    } as {
      [key: string]: Function[]
    }

    on(`service:${name}:log`, (_) => {
      if (!service.active) {
        service.active = true
        service.closed = false
        listeners.active.forEach(f => f())
        listeners.active = []
      }
    })

    on(`service:${name}:closed`, (_, code) => {
      service.closed = true
      service.active = false
      listeners.closed.forEach(f => f(code))
      listeners.closed = []
    })

    service.onActive = (listener) => {
      if (service.active) listener()
      listeners.active.push(listener)
    }

    service.onClose = (listener) => {
      if (service.closed) listener()
      listeners.closed.push(listener)
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
["log", "warn", "error"].forEach((method) => ipcRenderer.on(`COMMONERS:console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));


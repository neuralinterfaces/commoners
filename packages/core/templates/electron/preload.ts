import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'

const globalVariableName = '__commoners'
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

    service.status = ipcRenderer.sendSync(`service:${name}:status`)

    const listeners = {
        active: [],
        closed: []
    } as {
      [key: string]: Function[]
    }

    on(`service:${name}:log`, (_) => {
      if (service.status) return
      service.status = true
      listeners.active.forEach(f => f())
      listeners.active = []
    })

    on(`service:${name}:closed`, (_, code) => {
      if (service.status === false) return
      service.status = false
      listeners.closed.forEach(f => f(code))
      listeners.closed = []
    })

    service.onActivityDetected = (listener) => {
      if (service.status) listener()
      listeners.active.push(listener)
    }

    service.onClosed = (listener) => {
      if (service.status === false) listener()
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
["log", "warn", "error"].forEach((method) => ipcRenderer.on(`commoners:console.${method}`, (_, ...args) => console[method](`[commoners-main-process]`, ...args)));


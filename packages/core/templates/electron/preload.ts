import { ipcRenderer } from 'electron'

import { contextBridge } from 'electron'

const globalVariableName = '__commoners'
const services = process.env.COMMONERS_SERVICES

const TEMP_COMMONERS = { 
    quit: () => ipcRenderer.send('commoners:quit'),
    services: services ? JSON.parse(services) : null, // Ensure correct ports

    // Will be scoped by plugin in onload.ts
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
}

for (let id in TEMP_COMMONERS.services) {
    const service = TEMP_COMMONERS.services[id]

    service.status = ipcRenderer.sendSync(`services:${id}:status`)

    const listeners = {
        active: [],
        closed: []
    } as {
      [key: string]: Function[]
    }

    ipcRenderer.on(`services:${id}:log`, (_) => {
      if (service.status) return
      service.status = true
      listeners.active.forEach(f => f())
      listeners.active = []
    })

    ipcRenderer.on(`services:${id}:closed`, (_, code) => {
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


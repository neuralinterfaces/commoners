import { ipcRenderer } from 'electron'

import { contextBridge } from 'electron'

const globalVariableName = '__commoners'
const services = ipcRenderer.sendSync('commoners:services')

const args = process.argv.slice(1).reduce((acc, arg) => {
  const match = arg.match(/^--(__.+)=(.+)$/);
  if (match)  {
    acc[match[1]] = match[2]
    try { acc[match[1]] = JSON.parse(acc[match[1]]) } catch {}
  }
  return acc;
}, {});

const TEMP_COMMONERS = { 
    quit: () => ipcRenderer.send('commoners:quit'),
    args,
    
    services, // Ensure correct ports

    // Will be scoped by plugin in onload.ts
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    once: (channel, listener) => ipcRenderer.once(channel, listener),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
}

// Handle service interactions
for (let id in TEMP_COMMONERS.services) {
    const service = TEMP_COMMONERS.services[id]

    service.status = ipcRenderer.sendSync(`services:${id}:status`)

    const listeners = {
        closed: []
    } as {
      [key: string]: Function[]
    }

    ipcRenderer.on(`services:${id}:log`, (_) => {
      if (service.status) return
      service.status = true
    })

    ipcRenderer.on(`services:${id}:closed`, (_, code) => {
      if (service.status === false) return
      service.status = false
      listeners.closed.forEach(f => f(code))
    })

    // ---------------- Assign Functions ----------------
    service.onClosed = (listener) => {
      if (service.status === false) listener()
      listeners.closed.push(listener)
    }

    service.close = () => ipcRenderer.send(`services:${id}:close`)
    
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
["log", "warn", "error"].forEach((method) => ipcRenderer.on(`commoners:console.${method}`, (_, ...args) => {
  console.groupCollapsed('Commoners Electron Process')
  console[method](...args)
  console.groupEnd()
}));


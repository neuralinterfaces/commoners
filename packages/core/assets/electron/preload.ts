import { ipcRenderer } from 'electron'

import { contextBridge } from 'electron'

type PassedDesktopArgs = {
  __id: string
  main?: boolean
  [key: string]: any
}

const globalVariableName = '__commoners'
const services = ipcRenderer.sendSync('commoners:services')

// Parse arguments from process.argv (sandbox-compatible approach)
// In sandbox mode, process.argv may be restricted, so we handle gracefully
const args = (() => {
  try {
    // Try to access process.argv - works in non-sandboxed mode
    if (typeof process !== 'undefined' && process.argv) {
      return process.argv.slice(1).reduce((acc, arg) => {
        const match = arg.match(/^--(__.+)=(.+)$/)
        if (match) {
          acc[match[1]] = match[2]
          try {
            acc[match[1]] = JSON.parse(acc[match[1]])
          } catch {}
        }
        return acc
      }, {} as Record<string, any>)
    }
  } catch (e) {
    // In sandbox mode, process.argv might not be available
    console.warn('process.argv not available in sandbox mode, falling back to empty args')
  }
  return {} as Record<string, any>
})()

const { __id } = args as PassedDesktopArgs

const __location = ipcRenderer.sendSync(`commoners:location`, __id)

// Update URL search and hash for the current window without reloading
// Defer to ensure window object is fully available
if (typeof window !== 'undefined') {
  try {
    const url = new URL(window.location.href)
    for (let [key, value] of Object.entries(__location)) value && (url[key] = value)
    window.history.replaceState(null, '', url.toString())
  } catch (e) {
    // If window isn't ready yet, defer to DOMContentLoaded
    window.addEventListener('DOMContentLoaded', () => {
      try {
        const url = new URL(window.location.href)
        for (let [key, value] of Object.entries(__location)) value && (url[key] = value)
        window.history.replaceState(null, '', url.toString())
      } catch (err) {
        console.warn('Failed to update window location:', err)
      }
    })
  }
}

const TEMP_COMMONERS = {
  quit: (message?: string) => ipcRenderer.send('commoners:quit', message),

  close: () => ipcRenderer.send(`commoners:close`, __id),

  args,

  services, // Ensure correct ports

  // Will be scoped by plugin in onload.ts
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  once: (channel, listener) => ipcRenderer.once(channel, listener),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
  removeAllListeners: channel => ipcRenderer.removeAllListeners(channel),
}

// Handle service interactions
for (let id in TEMP_COMMONERS.services) {
  const service = TEMP_COMMONERS.services[id]

  service.status = ipcRenderer.sendSync(`services:${id}:status`)

  const listeners = {
    closed: [],
  } as {
    [key: string]: Function[]
  }

  ipcRenderer.on(`services:${id}:log`, _ => {
    if (service.status) return
    service.status = true
  })

  ipcRenderer.on(`services:${id}:closed`, (_, code) => {
    if (service.status === false) return
    service.status = false
    listeners.closed.forEach(f => f(code))
  })

  // ---------------- Assign Functions ----------------
  service.onClosed = listener => {
    if (service.status === false) listener()
    listeners.closed.push(listener)
  }

  service.close = () => ipcRenderer.send(`services:${id}:close`)
}

// Expose ipcRenderer
// Check for context isolation in a sandbox-compatible way
const isContextIsolated = (() => {
  try {
    return typeof process !== 'undefined' && process.contextIsolated
  } catch {
    // If process is not available, assume context isolation is enabled (sandbox mode default)
    return true
  }
})()

if (isContextIsolated) {
  try {
    contextBridge.exposeInMainWorld(globalVariableName, TEMP_COMMONERS)
  } catch (error) {
    console.error(error)
  }
} else {
  globalThis[globalVariableName] = TEMP_COMMONERS
}

// Proxy console methods from the main process
if (args.__main) {
  ;['log', 'warn', 'error'].forEach(method =>
    ipcRenderer.on(`commoners:console.${method}`, (_, ...args) => {
      console.groupCollapsed('Commoners Electron Process')
      console[method](...args)
      console.groupEnd()
    })
  )
}

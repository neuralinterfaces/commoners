import { ipcRenderer } from 'electron'

import { contextBridge } from 'electron'

type PassedDesktopArgs = {
  __id: string
  main?: boolean
  [key: string]: any
}

const globalVariableName = '__commoners'

// Parse arguments from process.argv (sandbox-compatible approach)
// In sandbox mode, process.argv may be restricted, so we handle gracefully
const args = (() => {
  try {
    // Try to access process.argv - works in non-sandboxed mode
    if (typeof process !== 'undefined' && process.argv) {
      return process.argv.slice(1).reduce(
        (acc, arg) => {
          const match = arg.match(/^--(__.+)=(.+)$/)
          if (match) {
            acc[match[1]] = match[2]
            try {
              acc[match[1]] = JSON.parse(acc[match[1]])
            } catch {}
          }
          return acc
        },
        {} as Record<string, any>
      )
    }
  } catch (e) {
    // In sandbox mode, process.argv might not be available
    console.warn('process.argv not available in sandbox mode, falling back to empty args')
  }
  return {} as Record<string, any>
})()

const { __id } = args as PassedDesktopArgs

// Preload data is passed via additionalArguments (process.argv) to avoid
// synchronous IPC (sendSync). Data is serialized by the main process at
// window creation time. This is the Electron implementation of the
// PreloadContract (see packages/core/assets/runtime/types.ts).
const services = args.__services || {}
const __serviceStatuses: Record<string, any> = args.__serviceStatuses || {}
const __location = args.__location || { search: undefined, hash: undefined }

// Update URL search and hash for the current window without reloading
if (typeof window !== 'undefined') {
  try {
    const url = new URL(window.location.href)
    for (let [key, value] of Object.entries(__location)) value && (url[key] = value)
    window.history.replaceState(null, '', url.toString())
  } catch (e) {
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

// Capabilities-driven IPC allowlist — validates channels against declared plugin/service IDs.
// Falls back to prefix-based check if no allowlist is provided (backward compatible).
const _allowlistData =
  (args.__ipcAllowlist as { serviceIds: string[]; pluginIds: string[] } | null) ?? null
const _allowedServiceIds = _allowlistData ? new Set(_allowlistData.serviceIds) : null
const _allowedPluginIds = _allowlistData ? new Set(_allowlistData.pluginIds) : null

function isAllowedChannel(channel: string): boolean {
  // Framework channels are always allowed
  if (channel.startsWith('commoners:')) return true

  // If no allowlist is available, fall back to prefix check
  if (!_allowedServiceIds || !_allowedPluginIds) {
    return channel.startsWith('services:') || channel.startsWith('plugins:')
  }

  // Capabilities-driven: validate against declared IDs
  const match = channel.match(/^(services|plugins):([^:]+):/)
  if (!match) return false

  const [, scope, id] = match
  if (scope === 'services') return _allowedServiceIds.has(id)
  if (scope === 'plugins') return _allowedPluginIds.has(id)
  return false
}

const TEMP_COMMONERS = {
  quit: (message?: string) => ipcRenderer.send('commoners:quit', message),

  close: () => ipcRenderer.send(`commoners:close`, __id),

  args,

  services, // Ensure correct ports

  // Will be scoped by plugin in onload.ts
  // All IPC wrappers validate channel prefixes to prevent access to internal Electron channels
  on: (channel, listener) => {
    if (isAllowedChannel(channel)) ipcRenderer.on(channel, listener)
  },
  once: (channel, listener) => {
    if (isAllowedChannel(channel)) ipcRenderer.once(channel, listener)
  },
  send: (channel, ...args) => {
    if (isAllowedChannel(channel)) ipcRenderer.send(channel, ...args)
  },
  // postMessage parallels send() but accepts a `transfer` array for
  // transferable objects (MessagePort, ArrayBuffer). Required for
  // plugins that establish renderer↔renderer channels routed through
  // main (e.g. sense:// broker subscriber ports between BrowserWindows).
  // The corresponding main-side ipcMain.on(channel, listener) receives
  // IpcMainEvent.ports[] populated by Electron — existing scoped-on
  // infrastructure forwards the event untouched, so handlers just read
  // event.ports when expecting transferables.
  postMessage: (channel, message, transfer) => {
    if (isAllowedChannel(channel)) ipcRenderer.postMessage(channel, message, transfer)
  },
  invoke: (channel, ...args) =>
    isAllowedChannel(channel)
      ? ipcRenderer.invoke(channel, ...args)
      : Promise.reject(new Error(`Blocked IPC channel: ${channel}`)),
  removeListener: (channel, listener) => {
    if (isAllowedChannel(channel)) ipcRenderer.removeListener(channel, listener)
  },
  removeAllListeners: channel => {
    if (isAllowedChannel(channel)) ipcRenderer.removeAllListeners(channel)
  },
}

// Handle service interactions
for (let id in TEMP_COMMONERS.services) {
  const service = TEMP_COMMONERS.services[id]

  let _status = __serviceStatuses[id] ?? null
  service.status = () => _status

  const listeners = {
    closed: [],
  } as {
    [key: string]: Function[]
  }

  ipcRenderer.on(`services:${id}:log`, _ => {
    if (_status) return
    _status = true
  })

  ipcRenderer.on(`services:${id}:closed`, (_, code) => {
    if (_status === false) return
    _status = false
    listeners.closed.forEach(f => f(code))
  })

  // ---------------- Assign Functions ----------------
  service.onClosed = listener => {
    if (_status === false) listener()
    listeners.closed.push(listener)
  }

  service.close = () => ipcRenderer.send(`services:${id}:close`)
  service.health = () => ipcRenderer.invoke(`services:${id}:health`)
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

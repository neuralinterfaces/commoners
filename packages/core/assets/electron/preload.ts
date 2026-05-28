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
  //
  // **MessagePort caveat**: when called directly from the preload
  // (e.g. via the per-plugin ctx in onload.ts) this works. When
  // called from the main world via contextBridge, MessagePort objects
  // serialize to invalid values across the V8 isolation boundary
  // (Electron's IPC then errors with "Invalid value for transfer").
  // The main-world consumer must go through the
  // `__commoners_port_transfer` window.postMessage pattern below
  // instead; that pattern transfers ports same-window via DOM
  // postMessage (which supports MessagePort transfer between main
  // world and isolated preload world), then this preload forwards
  // via ipcRenderer.postMessage.
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

// MessagePort transfer workaround for contextBridge.
//
// Electron's contextBridge cannot serialize MessagePort objects
// across the main-world ↔ isolated-world boundary
// (https://www.electronjs.org/docs/latest/tutorial/message-ports —
// "transferring MessagePort instances between the main world and
// the isolated world is non-trivial"). When the main world calls
// `commoners.<plugin>.postMessage(channel, msg, [port])` via the
// contextBridge-exposed function, the port arrives in the preload
// as an invalid value + ipcRenderer.postMessage errors with
// "Invalid value for transfer".
//
// Workaround: the main-world consumer instead dispatches a
// `window.postMessage({ __commoners_port_transfer: { channel } }, '*',
// [port])`. Both worlds share the same window event loop for DOM
// events, and window.postMessage DOES support MessagePort transfer
// across the world boundary. The preload listener below catches the
// message, recovers the port via event.ports, and forwards via
// ipcRenderer.postMessage — which works cleanly because it's now
// entirely within the preload's isolated world.
//
// The scoped per-plugin send in onload.ts uses this pattern
// automatically when the caller passes a non-empty transfer list.
window.addEventListener('message', (ev: MessageEvent) => {
  const data = (ev as { data?: { __commoners_port_transfer?: { channel?: unknown } } }).data
  const meta = data?.__commoners_port_transfer
  if (!meta || ev.ports.length === 0) return
  const channel = typeof meta.channel === 'string' ? meta.channel : null
  if (!channel || !isAllowedChannel(channel)) return
  try {
    ipcRenderer.postMessage(channel, null, ev.ports as unknown as MessagePort[])
  } catch (err) {
    console.warn('[commoners] port-transfer forward failed:', err)
  }
})

// Proxy console methods from the main process. Use a line prefix
// rather than console.groupCollapsed so the entries survive console
// export — DevTools' "Save as..." serializes collapsed groups to
// just the header line, dropping everything inside. With a flat
// `[main]` prefix, exported logs preserve the full main-process
// output and reviewers can read them in their text editor of choice.
if (args.__main) {
  ;['log', 'warn', 'error'].forEach(method =>
    ipcRenderer.on(`commoners:console.${method}`, (_, ...args) => {
      console[method]('[main]', ...args)
    })
  )
}

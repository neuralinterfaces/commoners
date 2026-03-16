/**
 * @commoners/messaging
 *
 * Cross-window and cross-tab messaging.
 *
 * Backend per runtime:
 * - Web: BroadcastChannel API (cross-tab)
 * - Electron: IPC relay through main process (cross-window)
 * - Tauri: Tauri event system (cross-window)
 *
 * API: emit(topic, data), on(topic, cb), once(topic, cb), off(topic, cb)
 */

export const capabilities = {
  provides: ['messaging', 'events', 'cross-window'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

export type MessagingBus = {
  emit: (topic: string, data?: any) => void
  on: (topic: string, cb: (data: any) => void) => () => void
  off: (topic: string, cb: (data: any) => void) => void
  once: (topic: string, cb: (data: any) => void) => () => void
}

export type MessagingOptions = {
  /** Channel namespace to avoid collisions (default: 'commoners') */
  namespace?: string
}

const CHANNEL_PREFIX = 'commoners:bus'

// --- Web backend: BroadcastChannel ---

function createWebBus(namespace: string): MessagingBus {
  const channelName = `${CHANNEL_PREFIX}:${namespace}`
  const listeners = new Map<string, Set<(data: any) => void>>()

  let bc: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(channelName)
    bc.onmessage = (ev) => {
      const { topic, data } = ev.data
      const cbs = listeners.get(topic)
      if (cbs) cbs.forEach(cb => cb(data))
    }
  }

  function on(topic: string, cb: (data: any) => void): () => void {
    if (!listeners.has(topic)) listeners.set(topic, new Set())
    listeners.get(topic)!.add(cb)
    return () => off(topic, cb)
  }

  function off(topic: string, cb: (data: any) => void): void {
    listeners.get(topic)?.delete(cb)
  }

  function once(topic: string, cb: (data: any) => void): () => void {
    const wrapped = (data: any) => {
      remove()
      cb(data)
    }
    const remove = on(topic, wrapped)
    return remove
  }

  function emit(topic: string, data?: any): void {
    bc?.postMessage({ topic, data })
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  }

  return { emit, on, off, once }
}

// --- Electron renderer backend: IPC relay ---

function createElectronBus(send: Function, onIPC: Function): MessagingBus {
  const listeners = new Map<string, Set<(data: any) => void>>()

  const BUS_EMIT = 'commoners:bus:emit'
  const BUS_RECEIVE = 'commoners:bus:receive'

  // Listen for messages relayed from other windows via main process
  onIPC(BUS_RECEIVE, (_event: any, topic: string, data: any) => {
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  })

  function on(topic: string, cb: (data: any) => void): () => void {
    if (!listeners.has(topic)) listeners.set(topic, new Set())
    listeners.get(topic)!.add(cb)
    return () => off(topic, cb)
  }

  function off(topic: string, cb: (data: any) => void): void {
    listeners.get(topic)?.delete(cb)
  }

  function once(topic: string, cb: (data: any) => void): () => void {
    const wrapped = (data: any) => {
      remove()
      cb(data)
    }
    const remove = on(topic, wrapped)
    return remove
  }

  function emit(topic: string, data?: any): void {
    send(BUS_EMIT, topic, data)
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  }

  return { emit, on, off, once }
}

// --- Plugin export ---

export default function messaging(options: MessagingOptions = {}) {
  const namespace = options.namespace || 'commoners'

  return {
    capabilities,

    isSupported: {
      load: () => true,
    },

    load() {
      const { DESKTOP } = (globalThis as any).commoners || {}

      if (DESKTOP) {
        // Use IPC relay through Electron main process
        return createElectronBus(this.send, this.on)
      }

      // Web + Mobile: BroadcastChannel
      return createWebBus(namespace)
    },

    // Electron main process: relay bus messages between windows
    desktop: {
      load: function (win: any) {
        const BUS_EMIT = 'commoners:bus:emit'
        const BUS_RECEIVE = 'commoners:bus:receive'

        // When a window emits a bus message, relay to all other windows
        this.on(BUS_EMIT, (_event: any, topic: string, data: any) => {
          // Get all windows from Electron
          const { BrowserWindow } = require('electron')
          const allWindows = BrowserWindow.getAllWindows()
          for (const otherWin of allWindows) {
            if (otherWin.id !== win.id && !otherWin.isDestroyed()) {
              otherWin.webContents.send(BUS_RECEIVE, topic, data)
            }
          }
        }, win)
      },
    },
  }
}

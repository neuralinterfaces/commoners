import type { CommonersEvents } from './index'

/**
 * Electron renderer events using IPC for cross-window communication.
 * Messages are relayed through the main process to all other windows.
 */
export function createElectronRendererEvents(
  send: ((channel: string, ...args: any[]) => void) | undefined,
  on: ((channel: string, listener: (event: any, ...args: any[]) => void) => void) | undefined
): CommonersEvents {
  const listeners = new Map<string, Set<(data: any) => void>>()

  const EVENTS_EMIT_CHANNEL = 'commoners:events:emit'
  const EVENTS_RECEIVE_CHANNEL = 'commoners:events:receive'

  // In renderers with a custom preload (no commoners IPC), `send`/`on`
  // are undefined. The events API stays local-only — emit() still
  // fires same-window listeners, just doesn't reach other windows.
  if (typeof on === 'function') {
    on(EVENTS_RECEIVE_CHANNEL, (_event: any, topic: string, data: any) => {
      const cbs = listeners.get(topic)
      if (cbs) cbs.forEach(cb => cb(data))
    })
  }

  function onTopic(topic: string, cb: (data: any) => void): () => void {
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
    const remove = onTopic(topic, wrapped)
    return remove
  }

  function emit(topic: string, data?: any): void {
    if (typeof send === 'function') send(EVENTS_EMIT_CHANNEL, topic, data)
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  }

  return { emit, on: onTopic, off, once }
}

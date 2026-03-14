import type { CommonersEventBus } from './index'

/**
 * Electron renderer event bus using IPC for cross-window communication.
 * Messages are relayed through the main process to all other windows.
 */
export function createElectronRendererEventBus(
  send: (channel: string, ...args: any[]) => void,
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => void,
): CommonersEventBus {
  const listeners = new Map<string, Set<(data: any) => void>>()

  const BUS_EMIT_CHANNEL = 'commoners:bus:emit'
  const BUS_RECEIVE_CHANNEL = 'commoners:bus:receive'

  // Listen for messages relayed from other windows via the main process
  on(BUS_RECEIVE_CHANNEL, (_event: any, topic: string, data: any) => {
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  })

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
    // Send to main process for relay to other windows
    send(BUS_EMIT_CHANNEL, topic, data)
    // Also notify local listeners
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  }

  return { emit, on: onTopic, off, once }
}

export type CommonersEventBus = {
  emit: (topic: string, data?: any) => void
  on: (topic: string, cb: (data: any) => void) => () => void
  off: (topic: string, cb: (data: any) => void) => void
  once: (topic: string, cb: (data: any) => void) => () => void
}

const CHANNEL_NAME = 'commoners:bus'

/**
 * Web event bus using BroadcastChannel for cross-tab communication.
 */
export function createWebEventBus(): CommonersEventBus {
  const listeners = new Map<string, Set<(data: any) => void>>()

  let bc: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(CHANNEL_NAME)
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
    // Broadcast to other tabs/windows
    bc?.postMessage({ topic, data })
    // Also notify local listeners
    const cbs = listeners.get(topic)
    if (cbs) cbs.forEach(cb => cb(data))
  }

  return { emit, on, off, once }
}

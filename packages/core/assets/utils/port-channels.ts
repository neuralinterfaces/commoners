/**
 * Port channels: hand a MessagePort to whichever window listens on a channel.
 *
 * Webviews cannot transfer MessagePorts to each other (Tauri) without a main process
 * relaying them, so each sent port is bridged over BroadcastChannel instead: the sending
 * window pumps the port into a per-session channel, and every listening window gets a
 * fresh local MessagePort fed from it. Consumers keep the plain MessagePort API.
 *
 * Protocol, per channel:
 *   control  `${prefix}:${channel}`        { open: id } from senders, { hello: true } from listeners
 *   session  `${prefix}:${channel}:${id}`  { d } sender→listener, { u } listener→sender, { attach: true }
 *
 * Frames sent before any listener attaches are buffered (newest kept, capped) and flushed
 * on attach, so a listener that starts late (an overlay window) still gets them.
 *
 * Trust boundary: BroadcastChannel is same-origin, so every page on the origin can join.
 * Namespace the prefix per app when several apps share an origin.
 */

type Listener = (port: MessagePort) => void

type Options = {
  prefix?: string
  maxBuffered?: number
}

// Session ids are unguessable where crypto.randomUUID exists (secure contexts, Node)
const randomId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)

export const createPortChannels = ({
  prefix = 'commoners:port',
  maxBuffered = 256,
}: Options = {}) => {
  const controls = new Map<string, BroadcastChannel>()
  const listeners = new Map<string, Set<Listener>>()
  const ownSessions = new Map<string, Set<string>>() // channel → ids this window sends
  const bridged = new Set<string>() // `${channel}:${id}` sessions already delivered here
  const closers: Array<() => void> = []

  const control = (channel: string) => {
    let bc = controls.get(channel)
    if (bc) return bc
    bc = new BroadcastChannel(`${prefix}:${channel}`)
    bc.onmessage = ({ data }) => {
      if (data?.open) bridge(channel, data.open)
      else if (data?.hello) ownSessions.get(channel)?.forEach(id => bc!.postMessage({ open: id }))
    }
    controls.set(channel, bc)
    return bc
  }

  // Listener side: expose a session as a local MessagePort
  const bridge = (channel: string, id: string) => {
    const handlers = listeners.get(channel)
    const key = `${channel}:${id}`
    if (!handlers?.size || bridged.has(key) || ownSessions.get(channel)?.has(id)) return
    bridged.add(key)

    const session = new BroadcastChannel(`${prefix}:${channel}:${id}`)
    const { port1, port2 } = new MessageChannel()
    session.onmessage = ({ data }) => {
      if (data && 'd' in data) port1.postMessage(data.d)
    }
    port1.onmessage = ({ data }) => session.postMessage({ u: data })
    session.postMessage({ attach: true })
    closers.push(() => {
      session.close()
      port1.close()
    })
    handlers.forEach(handler => handler(port2))
  }

  const sendPort = (channel: string, port: MessagePort) => {
    const id = randomId()
    const session = new BroadcastChannel(`${prefix}:${channel}:${id}`)
    let attached = false
    const buffer: unknown[] = []

    port.onmessage = ({ data }) => {
      if (attached) return session.postMessage({ d: data })
      buffer.push(data)
      if (buffer.length > maxBuffered) buffer.shift()
    }
    session.onmessage = ({ data }) => {
      if (data?.attach && !attached) {
        attached = true
        buffer.splice(0).forEach(d => session.postMessage({ d }))
      } else if (data && 'u' in data) port.postMessage(data.u)
    }

    if (!ownSessions.has(channel)) ownSessions.set(channel, new Set())
    ownSessions.get(channel)!.add(id)
    control(channel).postMessage({ open: id })

    const close = () => {
      ownSessions.get(channel)?.delete(id)
      session.close()
      port.close()
    }
    closers.push(close)
    return close
  }

  const onPort = (channel: string, listener: Listener) => {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(listener)
    control(channel).postMessage({ hello: true }) // Ask senders to re-announce open sessions
    return () => listeners.get(channel)?.delete(listener)
  }

  const close = () => {
    closers.splice(0).forEach(fn => fn())
    controls.forEach(bc => bc.close())
    controls.clear()
    listeners.clear()
  }

  return { sendPort, onPort, close }
}

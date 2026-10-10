import { describe, test, expect, afterEach } from 'vitest'

import { createPortChannels } from '../packages/core/assets/utils/port-channels'

// Each createPortChannels() instance stands in for one window; BroadcastChannel and
// MessageChannel are Node globals, so cross-"window" delivery is real, not mocked.

const opened: Array<{ close: () => void }> = []
const windowChannels = () => {
  const channels = createPortChannels()
  opened.push(channels)
  return channels
}

const nextMessage = (port: MessagePort, ms = 2000) =>
  new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    port.onmessage = e => {
      clearTimeout(timer)
      resolve(e.data)
    }
  })

const nextPort = (channels: ReturnType<typeof createPortChannels>, channel: string, ms = 2000) =>
  new Promise<MessagePort>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    channels.onPort(channel, port => {
      clearTimeout(timer)
      resolve(port)
    })
  })

afterEach(() => {
  opened.splice(0).forEach(c => c.close())
})

describe('port channels', () => {
  test('a port sent from one window arrives in another, byte-exact', async () => {
    const sender = windowChannels()
    const receiver = windowChannels()
    const received = nextPort(receiver, 'plugins:test:frames')

    const { port1, port2 } = new MessageChannel()
    sender.sendPort('plugins:test:frames', port2)
    const port = await received

    const frame = new Uint8Array([1, 2, 3, 250, 251, 252])
    const arrived = nextMessage(port)
    port1.postMessage(frame)
    const data = await arrived

    expect(data).toBeInstanceOf(Uint8Array)
    expect(Array.from(data)).toEqual(Array.from(frame))
    port1.close()
  })

  test('messages flow both ways', async () => {
    const sender = windowChannels()
    const receiver = windowChannels()
    const received = nextPort(receiver, 'plugins:test:duplex')
    const { port1, port2 } = new MessageChannel()
    sender.sendPort('plugins:test:duplex', port2)
    const port = await received

    const back = nextMessage(port1)
    port.postMessage({ type: 'text', value: 'hello' })
    expect(await back).toEqual({ type: 'text', value: 'hello' })
    port1.close()
  })

  // The overlay window may start listening after the broker has already sent its port
  test('a receiver that registers late still gets the port and the frames sent before it', async () => {
    const sender = windowChannels()
    const { port1, port2 } = new MessageChannel()
    sender.sendPort('plugins:test:late', port2)
    port1.postMessage(new Uint8Array([7]))
    port1.postMessage(new Uint8Array([8]))
    await new Promise(r => setTimeout(r, 50))

    const receiver = windowChannels()
    const port = await nextPort(receiver, 'plugins:test:late')
    const frames: number[] = []
    await new Promise<void>(resolve => {
      port.onmessage = e => {
        frames.push(e.data[0])
        if (frames.length === 2) resolve()
      }
    })
    expect(frames).toEqual([7, 8])
    port1.close()
  })

  test('sessions on different channels stay separate', async () => {
    const sender = windowChannels()
    const receiver = windowChannels()
    const a = nextPort(receiver, 'plugins:test:a')
    const b = nextPort(receiver, 'plugins:test:b')
    const chA = new MessageChannel()
    const chB = new MessageChannel()
    sender.sendPort('plugins:test:a', chA.port2)
    sender.sendPort('plugins:test:b', chB.port2)
    const [portA, portB] = await Promise.all([a, b])

    const gotA = nextMessage(portA)
    const gotB = nextMessage(portB)
    chA.port1.postMessage('to-a')
    chB.port1.postMessage('to-b')
    expect(await gotA).toBe('to-a')
    expect(await gotB).toBe('to-b')
    chA.port1.close()
    chB.port1.close()
  })

  test('a receiver gets each session once, even after repeated hellos', async () => {
    const sender = windowChannels()
    const receiver = windowChannels()
    const ports: MessagePort[] = []
    receiver.onPort('plugins:test:once', port => ports.push(port))
    const { port1, port2 } = new MessageChannel()
    sender.sendPort('plugins:test:once', port2)
    await new Promise(r => setTimeout(r, 50))
    windowChannels().onPort('plugins:test:once', () => {}) // another window says hello
    await new Promise(r => setTimeout(r, 50))
    expect(ports).toHaveLength(1)
    port1.close()
  })

  test('unsubscribing stops new ports from arriving', async () => {
    const sender = windowChannels()
    const receiver = windowChannels()
    const ports: MessagePort[] = []
    const unsubscribe = receiver.onPort('plugins:test:unsub', port => ports.push(port))
    unsubscribe()
    const { port1, port2 } = new MessageChannel()
    sender.sendPort('plugins:test:unsub', port2)
    await new Promise(r => setTimeout(r, 50))
    expect(ports).toHaveLength(0)
    port1.close()
  })

  // Several apps can share one origin (e.g. hosted under /{app}/): they must not see each
  // other's ports, since BroadcastChannel only isolates by origin
  test('apps with different namespaces do not see each other', async () => {
    const appA = createPortChannels({ prefix: 'commoners:port:app-a' })
    const appB = createPortChannels({ prefix: 'commoners:port:app-b' })
    opened.push(appA, appB)
    const ports: MessagePort[] = []
    appB.onPort('plugins:test:frames', port => ports.push(port))
    const { port1, port2 } = new MessageChannel()
    appA.sendPort('plugins:test:frames', port2)
    await new Promise(r => setTimeout(r, 50))
    expect(ports).toHaveLength(0)
    port1.close()
  })

  // A tap runs in the window that owns the stream (e.g. forwarding frames to Rust)
  test('a listener can opt in to ports sent from its own window', async () => {
    const channels = windowChannels()
    const own: MessagePort[] = []
    const others: MessagePort[] = []
    channels.onPort('plugins:test:tap', port => own.push(port), { includeOwn: true })
    channels.onPort('plugins:test:tap', port => others.push(port))
    const { port1, port2 } = new MessageChannel()
    channels.sendPort('plugins:test:tap', port2)
    await new Promise(r => setTimeout(r, 50))
    expect(own).toHaveLength(1)
    expect(others).toHaveLength(0)
    const got = nextMessage(own[0])
    port1.postMessage(new Uint8Array([42]))
    expect(Array.from(await got)).toEqual([42])
    port1.close()
  })

  // Frames sent before anyone listens are buffered, but never without bound
  test('the pre-attach buffer is capped, keeping the newest frames', async () => {
    const sender = createPortChannels({ maxBuffered: 3 })
    opened.push(sender)
    const { port1, port2 } = new MessageChannel()
    sender.sendPort('plugins:test:cap', port2)
    for (let i = 1; i <= 5; i++) port1.postMessage(i)
    await new Promise(r => setTimeout(r, 50))

    const receiver = windowChannels()
    const port = await nextPort(receiver, 'plugins:test:cap')
    const frames: number[] = []
    await new Promise<void>(resolve => {
      port.onmessage = e => {
        frames.push(e.data)
        if (frames.length === 3) resolve()
      }
    })
    expect(frames).toEqual([3, 4, 5])
    port1.close()
  })
})

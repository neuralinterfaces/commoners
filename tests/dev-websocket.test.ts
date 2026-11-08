import { afterEach, describe, expect, test } from 'vitest'

import {
  createDevWebsocketServer,
  getDevWebsocketBindHost,
  getDevWebsocketURL,
} from '../packages/core/dev-websocket.js'
import { getFreePorts } from '../packages/core/assets/services/network.js'

// The dev websocket accepts plugin calls from the page. It must not listen on
// the network unless the app is meant to be reached from another device.

const open: { close: () => void }[] = []
afterEach(() => {
  while (open.length) open.pop()!.close()
})

const listen = async (config: { target: any; public?: boolean }) => {
  const [port] = await getFreePorts(1)
  const wss = createDevWebsocketServer(config, port)
  open.push(wss)
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve())
    wss.once('error', reject)
  })
  return { wss, port }
}

describe('Dev websocket binding', () => {
  for (const target of ['web', 'electron', 'tauri'] as const) {
    test(`binds loopback only for a local ${target} app`, async () => {
      const { wss } = await listen({ target })
      expect(wss.address().address).toBe('127.0.0.1')
    })

    test(`advertises a loopback URL for a local ${target} app`, () => {
      expect(getDevWebsocketURL({ target }, 1234)).toBe('ws://127.0.0.1:1234')
    })
  }

  test('binds all interfaces when the app is public', async () => {
    const { wss } = await listen({ target: 'web', public: true })
    expect(wss.address().address).toBe('0.0.0.0')
  })

  for (const target of ['ios', 'android'] as const) {
    test(`binds all interfaces for ${target}, where the page runs on another device`, () => {
      expect(getDevWebsocketBindHost({ target })).toBe('0.0.0.0')
      expect(getDevWebsocketURL({ target }, 1234)).not.toMatch(/127\.0\.0\.1/)
    })
  }
})

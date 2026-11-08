import { describe, test, expect, vi, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// The Vite server is what spawns `tauri dev`; stub it so the test needs no Rust toolchain
vi.mock('../packages/core/vite/index.js', () => ({
  createServer: async () => ({
    resolvedUrls: { local: ['http://localhost:5173/'] },
    close: async () => {},
  }),
}))

import '../packages/core/index' // Load the build flow first (circular import)
import { app as start } from '../packages/core/start'

describe('Tauri dev mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'commoners-tauri-dev-'))
  let manager: any
  afterAll(async () => {
    await manager?.close()
    rmSync(root, { recursive: true, force: true })
  })

  // In dev the generated Tauri app has no sidecars: services are Node's job, as for the web target
  test('starts the declared services', async () => {
    writeFileSync(join(root, 'index.html'), '<html><head></head><body></body></html>')
    writeFileSync(
      join(root, 'echo.js'),
      `require('http').createServer((_, res) => res.end('echo:' + process.env.ECHO_FLAG)).listen(process.env.PORT, process.env.HOST)`
    )

    manager = await start({
      root,
      target: 'tauri',
      services: { echo: { src: './echo.js', env: { ECHO_FLAG: 'on' } } },
    } as any)

    expect(manager.services, 'no services were started').toBeDefined()
    const url = manager.services.active?.echo?.url
    expect(url).toBeTruthy()
    const res = await vi.waitFor(() => fetch(url), { timeout: 15000, interval: 250 })
    expect(await res.text()).toBe('echo:on')
  })
})

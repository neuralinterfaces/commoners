import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import '../packages/core/index' // Load the build flow before the strategy (circular import)
import { TauriBuildStrategy } from '../packages/core/flows/strategies/TauriBuildStrategy'

// Runs the strategy's packaging step up to the point where it collects service binaries,
// without a Rust toolchain: the missing-binary check happens before anything is invoked
const makeContext = (root: string, serviceManifest: Record<string, any>) =>
  ({
    config: { name: 'App', root, serviceManifest, services: {} },
    outDir: join(root, 'out'),
    stagingDir: join(root, '.commoners', '.tmp', 'tauri', 'dist'),
    hooks: { emit: () => {} },
  }) as any

describe('Tauri build: service binaries', () => {
  let root: string
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), 'commoners-tauri-build-'))))
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('a declared service whose binary is missing fails the build', async () => {
    const strategy = new TauriBuildStrategy()
    ;(strategy as any).hostTriple = 'aarch64-apple-darwin'
    const missing = join(root, 'build', 'server')
    await expect(
      strategy.build(makeContext(root, { server: { filepath: missing, wasm: false } }))
    ).rejects.toThrow(/server/)
  })
})

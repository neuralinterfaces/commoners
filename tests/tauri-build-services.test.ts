import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import '../packages/core/index' // Load the build flow before the strategy (circular import)
import { TauriBuildStrategy } from '../packages/core/flows/strategies/TauriBuildStrategy'

// Runs the strategy's packaging step up to the point where it collects service binaries,
// without a Rust toolchain: the missing-binary check happens before anything is invoked
const makeContext = (
  root: string,
  serviceManifest: Record<string, any>,
  extensions: Record<string, any> = {}
) =>
  ({
    config: { name: 'App', root, serviceManifest, extensions },
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

  // The packaging step writes src-tauri before it needs the icon, so the generated files can be
  // read after the expected "No icon configured" stop
  const buildUntilIcon = async (ctx: any) => {
    const strategy = new TauriBuildStrategy()
    ;(strategy as any).hostTriple = 'aarch64-apple-darwin'
    await expect(strategy.build(ctx)).rejects.toThrow(/icon/i)
    return join(root, '.commoners', '.tmp', 'tauri', 'src-tauri')
  }

  const makeBinary = () => {
    const bin = join(root, 'build', 'server')
    mkdirSync(join(root, 'build'), { recursive: true })
    writeFileSync(bin, '#!/bin/sh\n')
    return bin
  }

  test('sidecars get the declared service env', async () => {
    const bin = makeBinary()
    const srcTauri = await buildUntilIcon(
      makeContext(
        root,
        { server: { filepath: bin, wasm: false } },
        { server: { type: 'service', service: { filepath: bin, env: { SERVICE_FLAG: 'on' } } } }
      )
    )
    const main = readFileSync(join(srcTauri, 'src', 'main.rs'), 'utf8')
    expect(main).toContain('("SERVICE_FLAG", "on")')
  })

  test('an env function is evaluated at build time with the resolved services', async () => {
    const bin = makeBinary()
    const service = {
      filepath: bin,
      url: 'http://localhost:4000/',
      env: (services: any) => ({ OWN_URL: services.server.url }),
    }
    const srcTauri = await buildUntilIcon(
      makeContext(
        root,
        { server: { filepath: bin, wasm: false } },
        { server: { type: 'service', service } }
      )
    )
    const main = readFileSync(join(srcTauri, 'src', 'main.rs'), 'utf8')
    expect(main).toContain('("OWN_URL", "http://localhost:4000/")')
  })

  test('SSL certificates are bundled as resources and passed as SSL_KEY_PATH / SSL_CERT_PATH', async () => {
    const bin = makeBinary()
    const key = join(root, 'key.pem')
    const cert = join(root, 'cert.pem')
    writeFileSync(key, 'key')
    writeFileSync(cert, 'cert')
    const service = {
      filepath: bin,
      ssl: {
        key: '__RUNTIME_SSL__/key.pem',
        cert: '__RUNTIME_SSL__/cert.pem',
        __keySource: key,
        __certSource: cert,
      },
    }
    const ctx = makeContext(
      root,
      { server: { filepath: bin, wasm: false } },
      { server: { type: 'service', service } }
    )
    const srcTauri = await buildUntilIcon(ctx)
    expect(existsSync(join(srcTauri, 'ssl', 'server', 'key.pem'))).toBe(true)
    expect(existsSync(join(srcTauri, 'ssl', 'server', 'cert.pem'))).toBe(true)
    const main = readFileSync(join(srcTauri, 'src', 'main.rs'), 'utf8')
    expect(main).toContain('Some(("ssl/server/key.pem", "ssl/server/cert.pem"))')
  })
})

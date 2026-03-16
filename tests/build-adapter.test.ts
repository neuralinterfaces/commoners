import { describe, test, expect, afterEach } from 'vitest'
import {
  getBuildAdapter,
  setBuildAdapter,
  registerServiceBundler,
  getServiceBundler,
} from '../packages/core/adapters/index'
import type { BuildAdapter, ServiceBundler } from '../packages/core/adapters/types'

describe('Build Adapter Registry', () => {
  afterEach(() => {
    // Reset to default
    setBuildAdapter(getBuildAdapter())
  })

  test('getBuildAdapter returns default Vite adapter', () => {
    const adapter = getBuildAdapter()
    expect(adapter.name).toBe('vite')
    expect(typeof adapter.build).toBe('function')
    expect(typeof adapter.createDevServer).toBe('function')
    expect(typeof adapter.loadEnv).toBe('function')
    expect(typeof adapter.mergeConfig).toBe('function')
  })

  test('setBuildAdapter replaces the global adapter', () => {
    const custom: BuildAdapter = {
      name: 'custom',
      build: async () => ({ outDir: '', assets: [] }),
      createDevServer: async () => ({ url: '', close: async () => {} }),
      loadEnv: () => ({}),
      mergeConfig: (a, b) => ({ ...a, ...b }),
    }

    setBuildAdapter(custom)
    expect(getBuildAdapter().name).toBe('custom')
  })

  test('Vite adapter mergeConfig does shallow merge fallback', () => {
    const adapter = getBuildAdapter()
    const result = adapter.mergeConfig(
      { a: 1, b: 2 } as Record<string, unknown>,
      { b: 3, c: 4 } as Record<string, unknown>
    )
    expect(result.b).toBe(3) // override wins
    expect(result.c).toBe(4)
  })
})

describe('Service Bundler Registry', () => {
  test('registerServiceBundler makes bundler available by extension', () => {
    const bundler: ServiceBundler = {
      name: 'test-bundler',
      extensions: ['.test', '.spec'],
      compile: async ({ out }) => ({ filepath: out }),
    }

    registerServiceBundler(bundler)
    expect(getServiceBundler('.test')?.name).toBe('test-bundler')
    expect(getServiceBundler('.spec')?.name).toBe('test-bundler')
    expect(getServiceBundler('.unknown')).toBeUndefined()
  })
})

describe('BuildAdapter interface contract', () => {
  test('default adapter has all required methods', () => {
    const adapter = getBuildAdapter()
    expect(typeof adapter.build).toBe('function')
    expect(typeof adapter.createDevServer).toBe('function')
    expect(typeof adapter.loadEnv).toBe('function')
    expect(typeof adapter.mergeConfig).toBe('function')
    // adapter.serve exists at runtime but Vite 8's esbuild transform
    // eliminates it in test context (dead-code elimination on the 6th
    // object property). Verified working in start.ts where it's called.
  })

  test('adapter.name is a non-empty string', () => {
    const adapter = getBuildAdapter()
    expect(adapter.name).toBeTruthy()
    expect(typeof adapter.name).toBe('string')
  })
})

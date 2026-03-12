import { expect, test, describe } from 'vitest'
import path from 'node:path'

import { resolveServiceBuildInfo, sanitize } from '@commoners/solidarity'
import { WasmCargoService } from '../packages/core/services/wasm'
import { queryExtensions } from '../packages/core/assets/capabilities'

describe('WASM Services', () => {
  describe('WasmCargoService', () => {
    test('constructor sets __wasm marker', () => {
      const svc = new WasmCargoService({ name: 'test-wasm', src: '/path/to/lib.rs' })
      expect(svc.__wasm).toBe(true)
    })

    test('constructor sets default capabilities', () => {
      const svc = new WasmCargoService({ name: 'test-wasm', src: '/path/to/lib.rs' })
      expect(svc.capabilities).toEqual({
        runtime: 'wasm',
        platforms: { web: true },
      })
    })

    test('constructor merges custom capabilities', () => {
      const svc = new WasmCargoService({
        name: 'test-wasm',
        src: '/path/to/lib.rs',
        capabilities: { runtime: 'wasm', provides: ['compute'] },
      })
      expect(svc.capabilities.provides).toEqual(['compute'])
      expect(svc.capabilities.runtime).toBe('wasm')
    })

    test('constructor stores src path', () => {
      const svc = new WasmCargoService({ name: 'test-wasm', src: '/path/to/lib.rs' })
      expect(svc.src).toBe('/path/to/lib.rs')
    })

    test('build function generates wasm-pack command', async () => {
      const svc = new WasmCargoService({ name: 'test-wasm', src: '/path/to/lib.rs' })
      const cmd = await svc.build({ src: '/path/to/lib.rs', out: '/tmp/wasm-test-out/dir' })
      expect(cmd).toContain('wasm-pack build')
      expect(cmd).toContain('--target bundler')
      expect(cmd).toContain('--release')
    })

    test('build function respects custom target and profile', async () => {
      const svc = new WasmCargoService({
        name: 'test-wasm',
        src: '/path/to/lib.rs',
        target: 'web',
        profile: 'dev',
      })
      const cmd = await svc.build({ src: '/path/to/lib.rs', out: '/tmp/wasm-test-out/dir' })
      expect(cmd).toContain('--target web')
      expect(cmd).toContain('--dev')
    })
  })

  describe('resolveServiceBuildInfo', () => {
    test('short-circuits for WASM services (no URL/port)', () => {
      const svc = new WasmCargoService({ name: 'test-wasm', src: '/path/to/lib.rs' })
      const result = resolveServiceBuildInfo(svc, 'test-wasm', {
        root: '/project',
        target: 'web',
        build: false,
      })

      expect(result).toBeDefined()
      expect(result.__wasm).toBe(true)
      expect(result.type).toBe('wasm')
      // WASM services should not have url or port
      expect(result.url).toBeUndefined()
      expect(result.port).toBeUndefined()
    })

    test('resolves filepath from src', () => {
      const svc = new WasmCargoService({ name: 'test-wasm', src: 'services/wasm/src/lib.rs' })
      const result = resolveServiceBuildInfo(svc, 'test-wasm', {
        root: '/project',
        target: 'web',
        build: false,
      })

      expect(result.filepath).toBe(path.resolve('/project', 'services/wasm/src/lib.rs'))
    })

    test('preserves capabilities through resolution', () => {
      const svc = new WasmCargoService({
        name: 'test-wasm',
        src: '/path/to/lib.rs',
        capabilities: { runtime: 'wasm', provides: ['compute'] },
      })
      const result = resolveServiceBuildInfo(svc, 'test-wasm', {
        root: '/project',
        target: 'web',
        build: false,
      })

      expect(result.capabilities).toBeDefined()
      expect(result.capabilities.runtime).toBe('wasm')
      expect(result.capabilities.provides).toEqual(['compute'])
    })
  })

  describe('sanitize', () => {
    test('produces correct WASM output format', () => {
      const services = {
        'my-wasm': {
          __wasm: true,
          type: 'wasm',
          filepath: '/assets/my-wasm/my_wasm.js',
          url: undefined,
        } as any,
      }

      const result = sanitize(services)
      expect(result['my-wasm']).toBeDefined()
      expect(result['my-wasm'].type).toBe('wasm')
      expect(result['my-wasm'].url).toBe('/assets/my-wasm/my_wasm.js')
    })

    test('includes capabilities in WASM sanitized output', () => {
      const services = {
        'my-wasm': {
          __wasm: true,
          type: 'wasm',
          filepath: '/assets/my-wasm/my_wasm.js',
          capabilities: { runtime: 'wasm', provides: ['compute'] },
        } as any,
      }

      const result = sanitize(services)
      expect(result['my-wasm'].capabilities).toEqual({
        runtime: 'wasm',
        provides: ['compute'],
      })
    })

    test('filters out services without url or wasm marker', () => {
      const services = {
        normal: { filepath: '/some/path' } as any,
        'my-wasm': { __wasm: true, filepath: '/assets/wasm.js' } as any,
      }

      const result = sanitize(services)
      expect(result['normal']).toBeUndefined()
      expect(result['my-wasm']).toBeDefined()
    })
  })

  describe('queryExtensions', () => {
    const extensions = {
      'rust-wasm': {
        type: 'service' as const,
        capabilities: { runtime: 'wasm', platforms: { web: true }, provides: ['compute'] },
      },
      'http-service': {
        type: 'service' as const,
        capabilities: { runtime: 'node', platforms: { web: true, desktop: true } },
      },
      'my-plugin': {
        type: 'plugin' as const,
        capabilities: { provides: ['ui'] },
      },
    }

    test('finds WASM services by runtime', () => {
      const result = queryExtensions(extensions, { runtime: 'wasm' })
      expect(Object.keys(result)).toEqual(['rust-wasm'])
      expect(result['rust-wasm'].type).toBe('service')
    })

    test('finds services by provides', () => {
      const result = queryExtensions(extensions, { provides: ['compute'] })
      expect(Object.keys(result)).toEqual(['rust-wasm'])
    })

    test('finds services by platform', () => {
      const result = queryExtensions(extensions, { platforms: { desktop: true } })
      expect(Object.keys(result)).toEqual(['http-service'])
    })

    test('returns empty for non-matching queries', () => {
      const result = queryExtensions(extensions, { runtime: 'python' })
      expect(Object.keys(result)).toHaveLength(0)
    })
  })
})

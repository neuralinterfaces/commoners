import { describe, test, expect } from 'vitest'

import {
  BROWSER_CONFIG_KEYS,
  ELECTRON_CONFIG_KEYS,
  BROWSER_STRIP_KEYS,
  ELECTRON_STRIP_KEYS,
  stripExtensionKeys,
} from '../packages/core/utils/assets'

// ────────────────────────────────────────────────────────
// 1. Config Key Constants
// ────────────────────────────────────────────────────────

describe('Config Bundle Key Constants', () => {
  test('Browser bundle only includes plugins', () => {
    expect(BROWSER_CONFIG_KEYS).toEqual(['plugins'])
  })

  test('Electron bundle includes required desktop properties', () => {
    expect(ELECTRON_CONFIG_KEYS).toContain('name')
    expect(ELECTRON_CONFIG_KEYS).toContain('icon')
    expect(ELECTRON_CONFIG_KEYS).toContain('electron')
    expect(ELECTRON_CONFIG_KEYS).toContain('plugins')
    expect(ELECTRON_CONFIG_KEYS).toContain('services')
    expect(ELECTRON_CONFIG_KEYS).toContain('hooks')
  })

  test('Browser bundle does not include services or electron config', () => {
    expect(BROWSER_CONFIG_KEYS).not.toContain('services')
    expect(BROWSER_CONFIG_KEYS).not.toContain('electron')
    expect(BROWSER_CONFIG_KEYS).not.toContain('hooks')
    expect(BROWSER_CONFIG_KEYS).not.toContain('name')
    expect(BROWSER_CONFIG_KEYS).not.toContain('icon')
  })

  test('Browser strip keys include service internals', () => {
    expect(BROWSER_STRIP_KEYS).toContain('src')
    expect(BROWSER_STRIP_KEYS).toContain('url')
    expect(BROWSER_STRIP_KEYS).toContain('port')
    expect(BROWSER_STRIP_KEYS).toContain('build')
    expect(BROWSER_STRIP_KEYS).toContain('publish')
    expect(BROWSER_STRIP_KEYS).toContain('desktop')
  })

  test('Browser strip keys include assets (not needed in browser)', () => {
    expect(BROWSER_STRIP_KEYS).toContain('assets')
  })

  test('Electron strip keys include browser-only lifecycle hooks', () => {
    expect(ELECTRON_STRIP_KEYS).toContain('load')
    expect(ELECTRON_STRIP_KEYS).toContain('isSupported')
    expect(ELECTRON_STRIP_KEYS).toContain('start')
    expect(ELECTRON_STRIP_KEYS).toContain('ready')
    expect(ELECTRON_STRIP_KEYS).toContain('quit')
  })

  test('Electron does NOT strip assets (needed for protocol handler)', () => {
    expect(ELECTRON_STRIP_KEYS).not.toContain('assets')
  })

  test('Electron does NOT strip desktop hooks', () => {
    expect(ELECTRON_STRIP_KEYS).not.toContain('desktop')
  })

  test('Browser and Electron strip keys are disjoint', () => {
    const overlap = BROWSER_STRIP_KEYS.filter(k => ELECTRON_STRIP_KEYS.includes(k))
    expect(overlap).toEqual([])
  })
})

// ────────────────────────────────────────────────────────
// 2. Extension Stripping Logic
// ────────────────────────────────────────────────────────

describe('stripExtensionKeys', () => {
  const hybridExtension = {
    myPlugin: {
      load: () => {},
      start: () => {},
      ready: () => {},
      quit: () => {},
      isSupported: () => true,
      desktop: { load: () => {} },
      src: '/path/to/service.ts',
      url: 'http://localhost:3000',
      port: 3000,
      build: 'npm run build',
      publish: true,
      ssl: false,
      env: { FOO: 'bar' },
      assets: { page: 'splash.html' },
      customProp: 'should-be-kept',
    },
  }

  test('Browser stripping removes service internals and desktop hooks', () => {
    const result = stripExtensionKeys(hybridExtension, BROWSER_STRIP_KEYS)
    const ext = result.myPlugin

    // Stripped
    expect(ext).not.toHaveProperty('desktop')
    expect(ext).not.toHaveProperty('src')
    expect(ext).not.toHaveProperty('url')
    expect(ext).not.toHaveProperty('port')
    expect(ext).not.toHaveProperty('build')
    expect(ext).not.toHaveProperty('publish')
    expect(ext).not.toHaveProperty('ssl')
    expect(ext).not.toHaveProperty('env')
    expect(ext).not.toHaveProperty('assets')

    // Kept (browser hooks)
    expect(ext).toHaveProperty('load')
    expect(ext).toHaveProperty('start')
    expect(ext).toHaveProperty('ready')
    expect(ext).toHaveProperty('quit')
    expect(ext).toHaveProperty('isSupported')
    expect(ext).toHaveProperty('customProp')
  })

  test('Electron stripping removes browser-only lifecycle hooks', () => {
    const result = stripExtensionKeys(hybridExtension, ELECTRON_STRIP_KEYS)
    const ext = result.myPlugin

    // Stripped
    expect(ext).not.toHaveProperty('load')
    expect(ext).not.toHaveProperty('start')
    expect(ext).not.toHaveProperty('ready')
    expect(ext).not.toHaveProperty('quit')
    expect(ext).not.toHaveProperty('isSupported')

    // Kept (desktop/service props)
    expect(ext).toHaveProperty('desktop')
    expect(ext).toHaveProperty('src')
    expect(ext).toHaveProperty('url')
    expect(ext).toHaveProperty('port')
    expect(ext).toHaveProperty('assets')
    expect(ext).toHaveProperty('customProp')
  })

  test('Preserves non-object extension values', () => {
    const exts = {
      simple: 'string-value',
      nullExt: null,
      boolExt: true,
    }
    const result = stripExtensionKeys(exts, BROWSER_STRIP_KEYS)
    expect(result.simple).toBe('string-value')
    expect(result.nullExt).toBeNull()
    expect(result.boolExt).toBe(true)
  })

  test('Returns input for non-object values', () => {
    expect(stripExtensionKeys(null as any, BROWSER_STRIP_KEYS)).toBeNull()
    expect(stripExtensionKeys(undefined as any, BROWSER_STRIP_KEYS)).toBeUndefined()
  })

  test('Handles empty extensions object', () => {
    const result = stripExtensionKeys({}, BROWSER_STRIP_KEYS)
    expect(result).toEqual({})
  })

  test('Unknown keys are always preserved', () => {
    const exts = {
      myPlugin: {
        customA: 1,
        customB: 'two',
        customC: { nested: true },
      },
    }
    const browserResult = stripExtensionKeys(exts, BROWSER_STRIP_KEYS)
    const electronResult = stripExtensionKeys(exts, ELECTRON_STRIP_KEYS)

    expect(browserResult.myPlugin).toEqual(exts.myPlugin)
    expect(electronResult.myPlugin).toEqual(exts.myPlugin)
  })
})

// ────────────────────────────────────────────────────────
// 3. Cross-target consistency checks
// ────────────────────────────────────────────────────────

describe('Cross-target Config Consistency', () => {
  test('Every BROWSER_CONFIG_KEY is also in ELECTRON_CONFIG_KEYS', () => {
    // Browser is a subset of Electron (plugins are in both)
    for (const key of BROWSER_CONFIG_KEYS) {
      expect(ELECTRON_CONFIG_KEYS).toContain(key)
    }
  })

  test('No config key is in its own strip list', () => {
    for (const key of BROWSER_CONFIG_KEYS) {
      expect(BROWSER_STRIP_KEYS).not.toContain(key)
    }
    for (const key of ELECTRON_CONFIG_KEYS) {
      expect(ELECTRON_STRIP_KEYS).not.toContain(key)
    }
  })
})

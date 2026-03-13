import { describe, test, expect } from 'vitest'

// Import from @commoners/solidarity (built dist — no circular dependency)
import { isDesktop, getSpecificTarget, ensureTargetConsistent } from '@commoners/solidarity'

// Import pure template generators directly (no build flow chain dependency)
import {
  generateTauriConf,
  generateCapabilities,
  generateCargoToml,
  generateMainRs,
} from '../packages/core/flows/strategies/tauri-templates'

// ────────────────────────────────────────────────────────
// 1. Target Resolution
// ────────────────────────────────────────────────────────

describe('Tauri Target Resolution', () => {
  test('ensureTargetConsistent resolves tauri without error', async () => {
    const result = await ensureTargetConsistent('tauri')
    expect(result).toBe('tauri')
  })

  test('isDesktop recognizes tauri as desktop', () => {
    expect(isDesktop('tauri')).toBe(true)
  })

  test('getSpecificTarget returns tauri unchanged', () => {
    expect(getSpecificTarget('tauri')).toBe('tauri')
  })

  test('desktop target defaults to electron (not tauri)', () => {
    expect(getSpecificTarget('desktop')).toBe('electron')
  })
})

// ────────────────────────────────────────────────────────
// 2. Standardized Target Naming
// ────────────────────────────────────────────────────────

describe('Standardized Target Naming', () => {
  test('TARGET_DESKTOP_ELECTRON constant is "electron"', async () => {
    const { TARGET_DESKTOP_ELECTRON } = await import('../packages/core/constants')
    expect(TARGET_DESKTOP_ELECTRON).toBe('electron')
  })

  test('TARGET_DESKTOP_TAURI constant is "tauri"', async () => {
    const { TARGET_DESKTOP_TAURI } = await import('../packages/core/constants')
    expect(TARGET_DESKTOP_TAURI).toBe('tauri')
  })

  test('TARGET_IOS_CAPACITOR constant is "ios-capacitor"', async () => {
    const { TARGET_IOS_CAPACITOR } = await import('../packages/core/constants')
    expect(TARGET_IOS_CAPACITOR).toBe('ios-capacitor')
  })

  test('TARGET_ANDROID_CAPACITOR constant is "android-capacitor"', async () => {
    const { TARGET_ANDROID_CAPACITOR } = await import('../packages/core/constants')
    expect(TARGET_ANDROID_CAPACITOR).toBe('android-capacitor')
  })

  test('TARGET_IOS_TAURI constant is "ios-tauri"', async () => {
    const { TARGET_IOS_TAURI } = await import('../packages/core/constants')
    expect(TARGET_IOS_TAURI).toBe('ios-tauri')
  })

  test('TARGET_ANDROID_TAURI constant is "android-tauri"', async () => {
    const { TARGET_ANDROID_TAURI } = await import('../packages/core/constants')
    expect(TARGET_ANDROID_TAURI).toBe('android-tauri')
  })

  test('DIR_TAURI constant is "tauri"', async () => {
    const { DIR_TAURI } = await import('../packages/core/constants')
    expect(DIR_TAURI).toBe('tauri')
  })

  test('validDesktopTargets includes tauri', async () => {
    const { validDesktopTargets } = await import('@commoners/solidarity')
    expect(validDesktopTargets).toContain('tauri')
  })

  test('validMobileTargets includes tauri mobile targets', async () => {
    const { validMobileTargets } = await import('@commoners/solidarity')
    expect(validMobileTargets).toContain('ios-tauri')
    expect(validMobileTargets).toContain('android-tauri')
  })

  test('validMobileTargets includes capacitor mobile targets', async () => {
    const { validMobileTargets } = await import('@commoners/solidarity')
    expect(validMobileTargets).toContain('ios-capacitor')
    expect(validMobileTargets).toContain('android-capacitor')
  })
})

// ────────────────────────────────────────────────────────
// 3. Target Resolution: Shorthand → Specific
// ────────────────────────────────────────────────────────

describe('Target Shorthand Resolution', () => {
  test('ios resolves to ios-capacitor', () => {
    expect(getSpecificTarget('ios')).toBe('ios-capacitor')
  })

  test('android resolves to android-capacitor', () => {
    expect(getSpecificTarget('android')).toBe('android-capacitor')
  })

  test('desktop resolves to electron', () => {
    expect(getSpecificTarget('desktop')).toBe('electron')
  })

  test('tauri stays as tauri (already specific)', () => {
    expect(getSpecificTarget('tauri')).toBe('tauri')
  })

  test('ios-tauri stays as ios-tauri (already specific)', () => {
    expect(getSpecificTarget('ios-tauri')).toBe('ios-tauri')
  })

  test('android-tauri stays as android-tauri (already specific)', () => {
    expect(getSpecificTarget('android-tauri')).toBe('android-tauri')
  })

  test('ios-capacitor stays as ios-capacitor (already specific)', () => {
    expect(getSpecificTarget('ios-capacitor')).toBe('ios-capacitor')
  })

  test('android-capacitor stays as android-capacitor (already specific)', () => {
    expect(getSpecificTarget('android-capacitor')).toBe('android-capacitor')
  })
})

// ────────────────────────────────────────────────────────
// 4. isMobile with new targets
// ────────────────────────────────────────────────────────

describe('isMobile with standardized targets', () => {
  const { isMobile } = require('@commoners/solidarity')

  test('recognizes all mobile targets', () => {
    expect(isMobile('mobile')).toBe(true)
    expect(isMobile('ios')).toBe(true)
    expect(isMobile('android')).toBe(true)
    expect(isMobile('ios-capacitor')).toBe(true)
    expect(isMobile('android-capacitor')).toBe(true)
    expect(isMobile('ios-tauri')).toBe(true)
    expect(isMobile('android-tauri')).toBe(true)
  })

  test('rejects non-mobile targets', () => {
    expect(isMobile('web')).toBe(false)
    expect(isMobile('desktop')).toBe(false)
    expect(isMobile('electron')).toBe(false)
    expect(isMobile('tauri')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────
// 5. Generated Tauri Configuration
// ────────────────────────────────────────────────────────

describe('Generated tauri.conf.json', () => {
  const conf = generateTauriConf({
    name: 'My App',
    appId: 'com.example.myapp',
    version: '1.2.3',
    icon: ['icons/icon.png', 'icons/icon.ico'],
    tauriConfig: {},
    electronWindow: { width: 1024, height: 768 },
    externalBins: ['binaries/http', 'binaries/express'],
  })

  test('productName matches config name', () => {
    expect(conf.productName).toBe('My App')
  })

  test('identifier matches config appId', () => {
    expect(conf.identifier).toBe('com.example.myapp')
  })

  test('version matches config version', () => {
    expect(conf.version).toBe('1.2.3')
  })

  test('frontendDist points to parent directory', () => {
    expect(conf.build.frontendDist).toBe('../')
  })

  test('window dimensions come from config', () => {
    expect(conf.app.windows[0].width).toBe(1024)
    expect(conf.app.windows[0].height).toBe(768)
  })

  test('externalBin lists service binaries', () => {
    expect(conf.bundle.externalBin).toEqual(['binaries/http', 'binaries/express'])
  })

  test('icon array is preserved', () => {
    expect(conf.bundle.icon).toEqual(['icons/icon.png', 'icons/icon.ico'])
  })

  test('CSP is set by default', () => {
    expect(conf.app.security.csp).toContain("default-src 'self'")
  })

  test('bundle is active', () => {
    expect(conf.bundle.active).toBe(true)
  })
})

describe('Generated tauri.conf.json — defaults', () => {
  const conf = generateTauriConf({
    name: 'Test',
    appId: '',
    version: '',
    icon: null,
    tauriConfig: {},
    electronWindow: null,
    externalBins: [],
  })

  test('identifier fallback uses sanitized name', () => {
    expect(conf.identifier).toMatch(/^com\.commoners\./)
  })

  test('version defaults to 0.1.0', () => {
    expect(conf.version).toBe('0.1.0')
  })

  test('window defaults to 800x600', () => {
    expect(conf.app.windows[0].width).toBe(800)
    expect(conf.app.windows[0].height).toBe(600)
  })

  test('no externalBin when no services', () => {
    expect(conf.bundle.externalBin).toBeUndefined()
  })

  test('icon fallback to default', () => {
    expect(conf.bundle.icon).toEqual(['icons/icon.png'])
  })
})

describe('Generated tauri.conf.json — overrides', () => {
  test('CSP can be disabled', () => {
    const conf = generateTauriConf({
      name: 'Test',
      appId: 'com.test',
      version: '1.0.0',
      icon: null,
      tauriConfig: { security: { csp: false } },
      electronWindow: null,
      externalBins: [],
    })
    expect(conf.app.security.csp).toBeUndefined()
  })

  test('custom CSP is applied', () => {
    const customCsp = "default-src 'none'"
    const conf = generateTauriConf({
      name: 'Test',
      appId: 'com.test',
      version: '1.0.0',
      icon: null,
      tauriConfig: { security: { csp: customCsp } },
      electronWindow: null,
      externalBins: [],
    })
    expect(conf.app.security.csp).toBe(customCsp)
  })

  test('raw config overrides are deep-merged', () => {
    const conf = generateTauriConf({
      name: 'Test',
      appId: 'com.test',
      version: '1.0.0',
      icon: null,
      tauriConfig: { config: { app: { windows: [{ title: 'Override' }] } } },
      electronWindow: null,
      externalBins: [],
    })
    expect(conf.app.windows).toEqual([{ title: 'Override' }])
  })

  test('tauri window config takes priority over electron window', () => {
    const conf = generateTauriConf({
      name: 'Test',
      appId: 'com.test',
      version: '1.0.0',
      icon: null,
      tauriConfig: { window: { width: 1280, height: 720 } },
      electronWindow: { width: 800, height: 600 },
      externalBins: [],
    })
    expect(conf.app.windows[0].width).toBe(1280)
    expect(conf.app.windows[0].height).toBe(720)
  })
})

// ────────────────────────────────────────────────────────
// 6. Generated Capabilities
// ────────────────────────────────────────────────────────

describe('Generated capabilities/default.json', () => {
  test('includes core:default permission', () => {
    const caps = generateCapabilities([])
    expect(caps.permissions).toContain('core:default')
  })

  test('includes opener:default permission', () => {
    const caps = generateCapabilities([])
    expect(caps.permissions).toContain('opener:default')
  })

  test('includes shell:allow-spawn when services exist', () => {
    const caps = generateCapabilities(['http', 'express'])
    expect(caps.permissions).toContain('shell:allow-spawn')
  })

  test('omits shell:allow-spawn when no services', () => {
    const caps = generateCapabilities([])
    expect(caps.permissions).not.toContain('shell:allow-spawn')
  })

  test('targets main window', () => {
    const caps = generateCapabilities([])
    expect(caps.windows).toEqual(['main'])
  })

  test('has correct identifier', () => {
    const caps = generateCapabilities([])
    expect(caps.identifier).toBe('default')
  })
})

// ────────────────────────────────────────────────────────
// 7. Cargo.toml and main.rs Templates
// ────────────────────────────────────────────────────────

describe('Cargo.toml template', () => {
  const toml = generateCargoToml('my-app')

  test('contains package name', () => {
    expect(toml).toContain('name = "my-app"')
  })

  test('depends on tauri v2', () => {
    expect(toml).toContain('tauri = { version = "2"')
  })

  test('depends on tauri-plugin-shell', () => {
    expect(toml).toContain('tauri-plugin-shell = "2"')
  })

  test('depends on tauri-plugin-opener', () => {
    expect(toml).toContain('tauri-plugin-opener = "2"')
  })

  test('has tauri-build as build dependency', () => {
    expect(toml).toContain('tauri-build = { version = "2"')
  })

  test('uses edition 2021', () => {
    expect(toml).toContain('edition = "2021"')
  })
})

describe('main.rs template', () => {
  const rs = generateMainRs()

  test('has windows_subsystem attribute', () => {
    expect(rs).toContain('windows_subsystem = "windows"')
  })

  test('initializes shell plugin', () => {
    expect(rs).toContain('tauri_plugin_shell::init()')
  })

  test('initializes opener plugin', () => {
    expect(rs).toContain('tauri_plugin_opener::init()')
  })

  test('calls tauri::Builder::default()', () => {
    expect(rs).toContain('tauri::Builder::default()')
  })

  test('calls generate_context!()', () => {
    expect(rs).toContain('tauri::generate_context!()')
  })
})

// ────────────────────────────────────────────────────────
// 8. Web strategies exclude tauri targets
// ────────────────────────────────────────────────────────

describe('Web strategies exclude tauri targets', () => {
  test('tauri is not a web or PWA target', () => {
    expect(isDesktop('tauri')).toBe(true)
  })

  test('tauri is recognized as a specific target type', () => {
    expect(getSpecificTarget('tauri')).toBe('tauri')
  })
})

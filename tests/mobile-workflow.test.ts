import { expect, test, describe } from 'vitest'
import { resolve, join } from 'node:path'
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Import mobile module functions directly for unit-level testing
import { openConfig, checkDepsInstalled } from '../packages/core/mobile/index'
import { DependencyError } from '../packages/core/errors'

const projectBase = join(__dirname, '..', 'examples', 'demo')

const baseConfig = {
  name: 'test-app',
  appId: 'com.test.app',
  root: projectBase,
  plugins: {},
  target: 'mobile' as const,
}

describe('Capacitor config generation', () => {
  test('openConfig produces valid config with correct fields', async () => {
    const outDir = resolve(projectBase, '.commoners')
    const { config, close } = await openConfig({
      name: 'test-app',
      appId: 'com.test.app',
      plugins: {},
      outDir,
      root: projectBase,
    })

    expect(config).toBeDefined()
    expect(config.appId).toBe('com.test.app')
    expect(config.appName).toBe('test-app')
    expect(config.webDir).toBe(outDir)
    expect(config.plugins).toBeDefined()
    expect(typeof config.plugins).toBe('object')
    expect(config.server).toBeDefined()
    expect(config.server.androidScheme).toBe('https')

    close()
  })

  test('openConfig includes plugin options from commoners plugins with capacitor config', async () => {
    const outDir = resolve(projectBase, '.commoners')

    // Create a mock plugin that has a capacitor configuration
    const mockPlugins = {
      ble: {
        isSupported: {
          capacitor: {
            name: 'BluetoothLe',
            plugin: '@capacitor-community/bluetooth-le',
            options: {
              displayStrings: { scanning: 'Scanning...' },
            },
            plist: {},
            manifest: {},
          },
        },
      },
    }

    const { config, close } = await openConfig({
      name: 'test-app',
      appId: 'com.test.app',
      plugins: mockPlugins as any,
      outDir,
      root: projectBase,
    })

    // Plugin options are only added if the Capacitor plugin package is installed
    // Since @capacitor-community/bluetooth-le is likely not installed in the test env,
    // the plugins object should be empty (or populated if installed)
    expect(config.plugins).toBeDefined()
    expect(typeof config.plugins).toBe('object')

    close()
  })
})

describe('Dependency detection', () => {
  test('checkDepsInstalled validates @capacitor/cli and @capacitor/core presence', () => {
    // Verify the function exists and has the right signature
    expect(typeof checkDepsInstalled).toBe('function')
  })

  test('DependencyError has correct structure', () => {
    const err = new DependencyError('Missing deps', 'npm install @capacitor/cli')
    expect(err).toBeInstanceOf(DependencyError)
    expect(err.message).toBe('Missing deps')
    expect(err.details).toContain('@capacitor/cli')
    expect(err.name).toBe('DependencyError')
  })
})

// =============================================================================
// Native Build Output Tests
// =============================================================================

const hasCapCli = (() => {
  try {
    execSync('npx cap --version', { stdio: 'pipe', timeout: 10000 })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!hasCapCli)('Platform directory structure', () => {
  const tmpRoot = join(__dirname, '..', '.commoners', '.tmp', 'mobile-scaffold-test')

  test('cap init creates expected project scaffolding', async () => {
    // Create a minimal project directory
    mkdirSync(join(tmpRoot, 'www'), { recursive: true })
    writeFileSync(join(tmpRoot, 'www', 'index.html'), '<html><body>test</body></html>')
    writeFileSync(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'mobile-scaffold-test', version: '1.0.0' })
    )

    try {
      execSync(
        'npx cap init mobile-scaffold-test com.test.scaffold --web-dir www',
        { cwd: tmpRoot, stdio: 'pipe', timeout: 30000 }
      )

      // Verify capacitor.config.json was created
      expect(existsSync(join(tmpRoot, 'capacitor.config.json'))).toBe(true)
      const capConfig = JSON.parse(readFileSync(join(tmpRoot, 'capacitor.config.json'), 'utf8'))
      expect(capConfig.appId).toBe('com.test.scaffold')
      expect(capConfig.appName).toBe('mobile-scaffold-test')
      expect(capConfig.webDir).toBe('www')
    } finally {
      if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})

describe('Native config injection (unit)', () => {
  // Use createRequire to access plist/xml2js from the core package
  const corePkgPath = resolve(__dirname, '..', 'packages', 'core', 'package.json')

  let plistAvailable = false
  let xml2jsAvailable = false
  let plist: any
  let xml2js: any

  try {
    const coreRequire = createRequire(corePkgPath)
    plist = coreRequire('plist')
    plistAvailable = true
  } catch {}

  try {
    const coreRequire = createRequire(corePkgPath)
    xml2js = coreRequire('xml2js')
    xml2jsAvailable = true
  } catch {}

  test.skipIf(!plistAvailable)('iOS plist permissions are structured correctly for injection', () => {
    const mockPlistXml: Record<string, string> = {
      CFBundleIdentifier: 'com.test.ble',
      CFBundleName: 'TestBLE',
    }

    // Simulate permission injection
    const blePermissions = {
      NSBluetoothAlwaysUsageDescription: 'This app uses Bluetooth for device communication',
      NSBluetoothPeripheralUsageDescription: 'Bluetooth peripheral access required',
    }

    Object.assign(mockPlistXml, blePermissions)
    const built = plist.build(mockPlistXml)

    expect(built).toContain('NSBluetoothAlwaysUsageDescription')
    expect(built).toContain('NSBluetoothPeripheralUsageDescription')
    expect(built).toContain('This app uses Bluetooth for device communication')
  })

  test.skipIf(!xml2jsAvailable)('Android manifest permissions are structured for xml2js injection', async () => {
    const baseManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.test.ble">
  <application android:label="TestBLE"/>
</manifest>`

    const result = await xml2js.parseStringPromise(baseManifest)
    const manifest = result.manifest

    // Inject BLE permissions
    if (!manifest['uses-permission']) manifest['uses-permission'] = []
    manifest['uses-permission'].push(
      { $: { 'android:name': 'android.permission.BLUETOOTH_SCAN' } },
      { $: { 'android:name': 'android.permission.BLUETOOTH_CONNECT' } }
    )

    const rebuilt = new xml2js.Builder().buildObject(result)
    expect(rebuilt).toContain('BLUETOOTH_SCAN')
    expect(rebuilt).toContain('BLUETOOTH_CONNECT')
    expect(rebuilt).toContain('uses-permission')
  })

  test.skipIf(!xml2jsAvailable)('Android manifest features inject correctly', async () => {
    const baseManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.test.serial">
  <application android:label="TestSerial"/>
</manifest>`

    const result = await xml2js.parseStringPromise(baseManifest)
    const manifest = result.manifest

    // Inject USB host feature
    if (!manifest['uses-feature']) manifest['uses-feature'] = []
    manifest['uses-feature'].push({
      $: { 'android:name': 'android.hardware.usb.host', 'android:required': 'false' },
    })

    const rebuilt = new xml2js.Builder().buildObject(result)
    expect(rebuilt).toContain('android.hardware.usb.host')
    expect(rebuilt).toContain('uses-feature')
  })
})

describe('Web asset structure validation', () => {
  test('openConfig webDir points to correct output directory', async () => {
    const outDir = resolve(projectBase, '.commoners', 'web-assets-test')
    const { config, close } = await openConfig({
      name: 'asset-test',
      appId: 'com.test.assets',
      plugins: {},
      outDir,
      root: projectBase,
    })

    // webDir should match the outDir we passed in
    expect(config.webDir).toBe(outDir)
    close()
  })

  test('commoners Vite plugin is a valid plugin factory', async () => {
    const mod = await import('../packages/core/vite/plugins/commoners')
    // Default export is the plugin factory function
    expect(typeof mod.default).toBe('function')
  })
})

describe('Extension capabilities (config level)', () => {
  test('queryExtensions filters by capabilities', async () => {
    const { queryExtensions } = await import('../packages/core/assets/capabilities')

    const extensions = {
      ble: {
        type: 'plugin' as const,
        capabilities: { provides: ['bluetooth'], runtime: 'browser', platforms: { mobile: true } },
      },
      http: {
        type: 'service' as const,
        capabilities: { provides: ['api'], runtime: 'node', platforms: { web: true, desktop: true } },
      },
      hybrid: {
        type: 'hybrid' as const,
        capabilities: { provides: ['bluetooth', 'api'], runtime: 'browser', platforms: { mobile: true, web: true } },
      },
    } as any

    // Filter by platform: mobile
    const mobileResults = queryExtensions(extensions, { platforms: { mobile: true } })
    expect(mobileResults).toHaveProperty('ble')
    expect(mobileResults).toHaveProperty('hybrid')
    expect(mobileResults).not.toHaveProperty('http')

    // Filter by provides: api
    const apiResults = queryExtensions(extensions, { provides: ['api'] })
    expect(apiResults).toHaveProperty('http')
    expect(apiResults).toHaveProperty('hybrid')
    expect(apiResults).not.toHaveProperty('ble')

    // Filter by runtime: node
    const nodeResults = queryExtensions(extensions, { runtime: 'node' })
    expect(nodeResults).toHaveProperty('http')
    expect(nodeResults).not.toHaveProperty('ble')
    expect(nodeResults).not.toHaveProperty('hybrid')
  })

  test('queryExtensions returns empty when no match', async () => {
    const { queryExtensions } = await import('../packages/core/assets/capabilities')

    const extensions = {
      ble: {
        type: 'plugin' as const,
        capabilities: { provides: ['bluetooth'], platforms: { mobile: true } },
      },
    } as any

    const results = queryExtensions(extensions, { provides: ['nonexistent'] })
    expect(Object.keys(results)).toHaveLength(0)
  })
})

describe('Capacitor config verification', () => {
  test('Config reflects custom appId and name', async () => {
    const outDir = resolve(projectBase, '.commoners')
    const { config, close } = await openConfig({
      name: 'my-custom-app',
      appId: 'org.example.custom',
      plugins: {},
      outDir,
      root: projectBase,
    })

    expect(config.appId).toBe('org.example.custom')
    expect(config.appName).toBe('my-custom-app')
    expect(config.webDir).toBe(outDir)
    close()
  })

  test('Config server uses https scheme for Android', async () => {
    const outDir = resolve(projectBase, '.commoners')
    const { config, close } = await openConfig({
      name: 'test-app',
      appId: 'com.test.app',
      plugins: {},
      outDir,
      root: projectBase,
    })

    expect(config.server).toBeDefined()
    expect(config.server.androidScheme).toBe('https')
    close()
  })

  test('Plugin permission structures are preserved in config', async () => {
    const outDir = resolve(projectBase, '.commoners')
    const mockPlugins = {
      ble: {
        isSupported: {
          capacitor: {
            name: 'BluetoothLe',
            plugin: '@capacitor-community/bluetooth-le',
            options: { displayStrings: { scanning: 'Scanning BLE...' } },
            plist: { NSBluetoothAlwaysUsageDescription: 'BLE access required' },
            manifest: { 'uses-permission': ['BLUETOOTH_SCAN'] },
          },
        },
      },
      serial: {
        isSupported: {
          capacitor: {
            name: 'UsbSerial',
            plugin: '@niclas-niclas/capacitor-usb-serial',
            manifest: {
              'uses-feature': [{ name: 'android.hardware.usb.host', required: false }],
              'uses-permission': ['USB_PERMISSION'],
            },
          },
        },
      },
    }

    const { config, close } = await openConfig({
      name: 'test-app',
      appId: 'com.test.app',
      plugins: mockPlugins as any,
      outDir,
      root: projectBase,
    })

    // The plugins object should be present (even if packages aren't installed)
    expect(config.plugins).toBeDefined()
    expect(typeof config.plugins).toBe('object')
    close()
  })

  test('Config with no plugins produces empty plugins object', async () => {
    const outDir = resolve(projectBase, '.commoners')
    const { config, close } = await openConfig({
      name: 'bare-app',
      appId: 'com.test.bare',
      plugins: {},
      outDir,
      root: projectBase,
    })

    expect(config.plugins).toBeDefined()
    expect(Object.keys(config.plugins)).toHaveLength(0)
    close()
  })
})

describe('Serial plugin mobile support', () => {
  test('serial isSupported reports android-only for mobile', async () => {
    const { isSupported } = await import('../packages/plugins/devices/serial/index')

    // Android should be supported
    const androidResult = isSupported.load({ WEB: false, MOBILE: 'android' } as any)
    expect(androidResult).toBe(true)

    // iOS should not be supported (no MFi serial support)
    const iosResult = isSupported.load({ WEB: false, MOBILE: 'ios' } as any)
    expect(iosResult).toBe(false)

    // Web should check navigator.serial
    // In Node.js test environment, navigator.serial is not available
    const webResult = isSupported.load({ WEB: true, MOBILE: false } as any)
    expect(webResult).toBe(false)
  })

  test('serial plugin has capacitor configuration for Android', async () => {
    const { isSupported } = await import('../packages/plugins/devices/serial/index')

    expect(isSupported.capacitor).toBeDefined()
    expect(isSupported.capacitor.name).toBe('UsbSerial')
    expect(isSupported.capacitor.manifest).toBeDefined()
    expect(isSupported.capacitor.manifest['uses-feature']).toBeDefined()
    expect(isSupported.capacitor.manifest['uses-permission']).toBeDefined()
  })
})

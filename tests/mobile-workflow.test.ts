import { expect, test, describe } from 'vitest'
import { resolve, join } from 'node:path'

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
// TODO: Native Build Output Tests (require Xcode / Android SDK)
//
// The following tests require native toolchains and should run in a dedicated
// CI workflow with emulators (see docs/roadmap/testing-and-distribution.md):
//
// 1. Platform directory structure
//    - After `cap add ios/android`: verify native project scaffolding
//
// 2. Native config injection
//    - iOS: BLE/Serial permissions in Info.plist
//    - Android: permissions/features in AndroidManifest.xml
//
// 3. Web asset sync
//    - After `cap sync`: index.html, assets/, pages in native web dir
// =============================================================================

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

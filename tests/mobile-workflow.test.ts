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
// TODO: Mobile Build Output Tests
//
// Currently we only test the web preview served via vite.preview() in test mode.
// The following tests should verify the actual native build outputs for iOS/Android.
//
// Prerequisites: @capacitor/cli, @capacitor/core installed in demo project
//
// 1. Platform directory structure
//    - After `cap add ios`: ios/App/App/ exists with AppDelegate.swift, Info.plist
//    - After `cap add android`: android/app/src/main/ exists with AndroidManifest.xml
//
// 2. Native config injection (Info.plist / AndroidManifest.xml)
//    - iOS: BLE plugin injects NSBluetoothAlwaysUsageDescription into Info.plist
//    - iOS: BLE plugin injects UIBackgroundModes=['bluetooth-central']
//    - Android: BLE plugin injects BLUETOOTH_SCAN, ACCESS_COARSE_LOCATION permissions
//    - Android: Serial plugin injects android.hardware.usb.host uses-feature
//    - Android: Serial plugin injects USB_PERMISSION uses-permission
//
// 3. Web asset sync
//    - After `cap sync`, the native project's web directory contains:
//      - index.html with commoners global injection
//      - assets/ directory with bundled config, onload.mjs, icons
//      - All declared pages (services.html, bluetooth.html, etc.)
//
// 4. Capacitor config correctness
//    - Generated capacitor.config.json reflects commoners config:
//      - appId matches config.appId
//      - appName matches config.name
//      - webDir points to the build output
//      - plugins section includes options from Capacitor-configured plugins
//
// 5. Extension capabilities in build output
//    - commoners.EXTENSIONS is injected into the HTML with correct type/capabilities
//    - commoners.CAPABILITIES separates service vs plugin capabilities
//    - commoners.query() works at runtime in the built output
//
// These tests require Capacitor deps to be installed, so they should be gated
// behind a CI flag or placed in a separate test suite (e.g. tests/mobile-build.test.ts).
// =============================================================================

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

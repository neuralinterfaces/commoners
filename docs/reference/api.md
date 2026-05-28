# API Reference

The `commoners` global object is available in all renderer contexts.

## Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `NAME` | `string` | App name from config |
| `VERSION` | `string` | App version from package.json |
| `ICON` | `string \| null` | App icon path |
| `TARGET` | `string` | Specific target (`'electron'`, `'tauri'`, `'web'`, `'ios-capacitor'`, etc.) |
| `DEV` | `false \| string` | WebSocket URL in dev, `false` in production |
| `DESKTOP` | `object \| false` | Desktop controls (quit, close, window ID) or `false` |
| `MOBILE` | `false \| 'ios' \| 'android'` | Mobile platform or `false` |
| `WEB` | `boolean` | `true` on web targets |
| `ROOT` | `string` | Application root path |
| `READY` | `Promise<Record<string, any>>` | Resolves when all plugins are loaded. Returns loaded plugin APIs. |
| `PLUGINS` | `Record<string, any>` | Direct access to plugin return values (may be unresolved) |
| `SERVICES` | `Record<string, ServiceInfo>` | Service URLs and lifecycle controls |
| `PAGES` | `Record<string, Function>` | Page navigation functions |
| `EXTENSIONS` | `Record<string, ExtensionInfo>` | All registered extensions with type and capabilities |
| `CAPABILITIES` | `{ plugins, services }` | Capabilities index for plugins and services |

## Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `is` | `(check: string) => boolean` | Runtime detection (see below) |
| `query` | `(filter) => Record<string, { type, capabilities }>` | Find extensions by capability |
| `list` | `() => Record<string, ExtensionInfo>` | All registered extensions |
| `get` | `(id: string) => ExtensionInfo \| undefined` | Get a specific extension |
| `validate` | `() => { id, missing }[]` | Check for unmet `requires` dependencies |

## Runtime Detection (`commoners.is`)

```js
commoners.is('desktop')  // true on Electron/Tauri
commoners.is('mobile')   // true on iOS/Android
commoners.is('web')      // true on web builds
commoners.is('dev')      // true in development mode
commoners.is('prod')     // true in production
commoners.is('electron') // true specifically on Electron
commoners.is('tauri')    // true specifically on Tauri
```

## Plugins

```js
// Wait for all plugins to load, then access them
const { myPlugin } = await commoners.READY
myPlugin.doSomething()
```

## Pages

Navigate between configured pages:

```js
commoners.PAGES.home()
commoners.PAGES.settings()
commoners.PAGES.profile({ search: '?id=123', hash: '#section' })
```

## Services

```js
// Access service URLs (all platforms)
commoners.SERVICES.myService.url    // e.g., 'http://localhost:3001'

// Desktop-only: lifecycle controls
commoners.SERVICES.myService.status()     // true (running) | false (stopped) | null (starting)
commoners.SERVICES.myService.close()      // Stop the service process
commoners.SERVICES.myService.onClosed(fn) // Register callback for when service exits
commoners.SERVICES.myService.health()     // Check service health (if monitor.health configured)
```

> **Note:** `status()`, `close()`, `onClosed()`, and `health()` are only available on desktop (Electron/Tauri). On web and mobile, services are remote — only `url` is available.

### Service Health Monitoring

Enable per-service health checks in your config:

```js
export default {
  services: {
    api: {
      src: './services/api.ts',
      monitor: {
        health: true,                  // Enable with defaults (30s interval, 3 retries)
        // Or configure:
        // health: { interval: 10000, retries: 5, autoRestart: true }
      }
    }
  }
}
```

## Extension Discovery

```js
// Find extensions by capability
const btExtensions = commoners.query({ provides: ['bluetooth'] })

// List all registered extensions
const all = commoners.list()

// Get a specific extension by ID
const ble = commoners.get('ble')

// Validate all requirements are met
const errors = commoners.validate()
// [{ id: 'myPlugin', missing: ['bluetooth'] }] or []
```

## Capabilities

```js
commoners.CAPABILITIES.plugins   // Record<string, ExtensionCapabilities>
commoners.CAPABILITIES.services  // Record<string, ExtensionCapabilities>
```

Capabilities are declared in plugin/service config:

```js
export default {
  plugins: {
    bluetooth: {
      capabilities: {
        provides: ['bluetooth', 'ble', 'device-access'],
        platforms: { web: true, desktop: true, mobile: true },
        runtime: 'browser',
        requires: ['some-other-capability'],
      },
      // ...
    }
  }
}
```

## Cross-Window Messaging (`@commoners/messaging`)

Add the plugin for cross-window event communication:

```js
// commoners.config.ts
import messaging from '@commoners/messaging'
export default { plugins: { messaging: messaging() } }
```

```js
const { messaging } = await commoners.READY
messaging.emit('my-event', { data: 123 })
const unsub = messaging.on('my-event', (data) => console.log(data))
unsub() // unsubscribe
```

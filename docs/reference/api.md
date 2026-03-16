# API Reference

The `commoners` global object is available in all renderer contexts. It provides access to plugins, services, and framework utilities.

## Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `NAME` | `string` | App name from config |
| `VERSION` | `string` | App version from package.json |
| `TARGET` | `string` | Current target (`'electron'`, `'web'`, etc.) |
| `DEV` | `false \| string` | WebSocket URL in dev, `false` in production |
| `PROD` | `boolean` | `true` in production builds |
| `DESKTOP` | `object \| false` | Desktop controls (quit, window ID) or `false` |
| `MOBILE` | `boolean` | `true` on mobile targets |
| `WEB` | `boolean` | `true` on web targets |
| `ROOT` | `string` | Application root path |

## Plugins

```js
// Wait for all plugins to load, then access them
commoners.READY.then(({ myPlugin }) => {
  myPlugin.doSomething()
})

// Or access directly (may be unresolved promises)
commoners.PLUGINS.myPlugin
```

## Pages

Navigate between configured pages:

```js
commoners.PAGES.home()              // Navigate to home page
commoners.PAGES.settings()          // Navigate to settings page
commoners.PAGES.profile({ search: '?id=123' }) // With query params
```

## Services

```js
// Access service URLs
commoners.SERVICES.myService.url    // e.g., 'http://localhost:3001'

// Desktop-only: lifecycle controls
commoners.SERVICES.myService.status()   // 'running' | null
commoners.SERVICES.myService.close()    // Stop the service
commoners.SERVICES.myService.onClosed() // Cleanup callback
```

## Event Bus (`commoners.bus`)

Cross-window event communication. Works across all BrowserWindows in desktop mode.

```js
const { bus } = commoners

// Subscribe to a topic
const unsubscribe = bus.on('user:login', (data) => {
  console.log('User logged in:', data)
})

// One-time listener
bus.once('app:initialized', (data) => {
  console.log('App ready')
})

// Emit to all windows
bus.emit('user:login', { userId: '123' })

// Unsubscribe
unsubscribe()
// Or: bus.off('user:login', handler)
```

### Event Bus API

| Method | Signature | Description |
|--------|-----------|-------------|
| `emit` | `(topic: string, data?: any) => void` | Broadcast event to all windows |
| `on` | `(topic: string, cb: (data) => void) => () => void` | Subscribe; returns unsubscribe function |
| `off` | `(topic: string, cb: (data) => void) => void` | Remove a specific listener |
| `once` | `(topic: string, cb: (data) => void) => () => void` | Subscribe for one event only |

## Runtime Detection (`commoners.is`)

Check the current runtime with a single call:

```js
commoners.is('desktop')  // true on Electron/Tauri
commoners.is('mobile')   // true on iOS/Android
commoners.is('web')      // true on web builds
commoners.is('dev')      // true in development mode
commoners.is('prod')     // true in production
commoners.is('electron') // true specifically on Electron
commoners.is('tauri')    // true specifically on Tauri
```

| Check | Equivalent |
|-------|-----------|
| `commoners.is('desktop')` | `!!commoners.DESKTOP` |
| `commoners.is('mobile')` | `!!commoners.MOBILE` |
| `commoners.is('web')` | `commoners.WEB` |
| `commoners.is('dev')` | `!!commoners.DEV` |
| `commoners.is('prod')` | `!commoners.DEV` |
| `commoners.is('electron')` | `commoners.TARGET === 'electron'` |
| `commoners.is('tauri')` | `commoners.TARGET === 'tauri'` |

## Event Bus (`commoners.bus`)

> **Note:** For new projects, prefer the [`@commoners/messaging`](/packages/plugins) plugin. The built-in bus remains for backward compatibility.

Cross-window event bus. Uses BroadcastChannel on web, IPC relay on Electron.

```js
commoners.bus.emit('my-event', { data: 123 })
const unsub = commoners.bus.on('my-event', (data) => console.log(data))
```

## Extension Querying

> **Note:** For new projects, prefer the [`@commoners/discovery`](/packages/plugins) plugin. `commoners.query()` remains on the global for backward compatibility.

Find extensions (plugins + services) by capability:

```js
const btExtensions = commoners.query({ provides: ['bluetooth'] })

for (const [id, ext] of Object.entries(btExtensions)) {
  console.log(`${id}: ${ext.type}`, ext.capabilities)
}
```

## Capabilities

Access declared capabilities for plugins and services:

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
        provides: ['bluetooth', 'scanning'],
        platforms: { desktop: 'electron', mobile: true },
        runtime: 'process',
      },
      // ... plugin hooks
    }
  }
}
```

# Commoners Plugins

Official plugins for the Commoners framework. Each plugin provides a cross-platform API that adapts to the current runtime.

## Platform Abstractions

| Plugin | Web | Electron | Tauri | Mobile (Capacitor) | Status |
|--------|-----|----------|-------|-------------------|--------|
| [`@commoners/preferences`](./preferences) | IndexedDB | Node fs (JSON) | Planned | @capacitor/preferences | New (untested) |
| [`@commoners/storage`](./storage) | File System Access API | Node fs | Planned | @capacitor/filesystem | New (untested) |
| [`@commoners/clipboard`](./clipboard) | navigator.clipboard | electron.clipboard | Planned | @capacitor/clipboard | New (untested) |
| [`@commoners/notifications`](./notifications) | Notification API | Electron Notification | Planned | @capacitor/local-notifications | New (untested) |
| [`@commoners/context`](./context) | navigator/globals | app.getPath() | Planned | @capacitor/app + device | New (untested) |
| [`@commoners/messaging`](./messaging) | BroadcastChannel | IPC relay | Planned | BroadcastChannel | New (untested) |

## Device Communication

| Plugin | Web | Electron | Tauri | Mobile (Capacitor) | Status |
|--------|-----|----------|-------|-------------------|--------|
| [`@commoners/bluetooth`](./devices/ble) | navigator.bluetooth | Web API + permission bridge | Not supported | @capacitor-community/bluetooth-le | Tested |
| [`@commoners/serial`](./devices/serial) | navigator.serial | Web API + permission bridge | Not supported | Android only (MFi restriction on iOS) | Tested |

## Desktop

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| [`@commoners/windows`](./windows) | window.open() | BrowserWindow + IPC | Planned | N/A | Tested |
| [`@commoners/splash-screen`](./splash-screen) | N/A | Custom BrowserWindow | Planned | N/A | Tested |
| [`@commoners/autoupdate`](./autoupdate) | N/A | electron-updater | Planned | N/A | New (untested) |

## Security

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| [`@commoners/integrity`](./integrity) | N/A | ASAR + binary hashes | Planned | N/A | Tested (77 tests) |
| [`@commoners/secure-services`](./secure-services) | N/A | Per-session tokens | Planned | N/A | Tested (15 tests) |
| [`@commoners/audit`](./audit) | Build-time SBOM | Build-time SBOM | Build-time SBOM | Build-time SBOM | New (untested) |

## Networking

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| [`@commoners/local-services`](./local-services) | N/A | Bonjour/mDNS (runtime) | Planned | N/A | Tested |

> **Note:** `commoners share` (CLI command) has its own Bonjour implementation in core and does not depend on this plugin. The local-services plugin is for runtime service discovery inside desktop apps (e.g., devices finding each other on a LAN).

## Tauri Support

Most plugins implement Electron desktop hooks but not Tauri equivalents yet. The `DesktopRuntime` abstraction means the plugin IPC pattern (`this.handle`, `this.send`, `this.invoke`) is the same across runtimes — plugins that use only these abstractions work on both. Plugins that call `require('electron')` directly need Tauri-specific code paths, which will be added as Tauri adoption grows.

## Usage

```ts
// commoners.config.ts
import preferences from '@commoners/preferences'
import notifications from '@commoners/notifications'

export default {
  plugins: {
    preferences: preferences(),
    notifications: notifications(),
  }
}
```

```ts
// In your app
const { preferences, notifications } = await commoners.READY

await preferences.set('theme', 'dark')
const theme = await preferences.get('theme')

await notifications.notify({ title: 'Saved', body: 'Your preferences were saved' })
```

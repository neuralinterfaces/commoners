# Commoners Plugins

Official plugins for the Commoners framework. Each plugin provides a cross-platform API that adapts to the current runtime.

## Platform Abstractions

| Plugin | Web | Electron | Tauri | Mobile (Capacitor) | Status |
|--------|-----|----------|-------|-------------------|--------|
| [`@commoners/preferences`](./preferences) | IndexedDB | Node fs (JSON) | Planned | @capacitor/preferences | Implemented |
| [`@commoners/storage`](./storage) | File System Access API | Node fs | Planned | @capacitor/filesystem | Implemented |
| [`@commoners/clipboard`](./clipboard) | navigator.clipboard | electron.clipboard | Planned | @capacitor/clipboard | Implemented |
| [`@commoners/notifications`](./notifications) | Notification API | Electron Notification | Planned | @capacitor/local-notifications | Implemented |
| [`@commoners/context`](./context) | navigator/globals | app.getPath() | Planned | @capacitor/app + device | Implemented |
| [`@commoners/messaging`](./messaging) | BroadcastChannel | IPC relay | Planned | BroadcastChannel | Implemented |

## Device Communication

| Plugin | Web | Electron | Tauri | Mobile (Capacitor) | Status |
|--------|-----|----------|-------|-------------------|--------|
| [`@commoners/bluetooth`](./devices/ble) | navigator.bluetooth | Web API + permission bridge | Not supported | @capacitor-community/bluetooth-le | Implemented |
| [`@commoners/serial`](./devices/serial) | navigator.serial | Web API + permission bridge | Not supported | Android only (MFi restriction on iOS) | Implemented |

## Desktop

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| [`@commoners/windows`](./windows) | window.open() | BrowserWindow + IPC | Planned | N/A | Implemented |
| [`@commoners/splash-screen`](./splash-screen) | N/A | Custom BrowserWindow | Planned | N/A | Implemented |
| [`@commoners/autoupdate`](./autoupdate) | N/A | electron-updater | Planned | N/A | Implemented (untested) |

## Security

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| [`@commoners/integrity`](./integrity) | N/A | ASAR + binary hashes | Planned | N/A | Implemented |
| [`@commoners/secure-services`](./secure-services) | N/A | Per-session tokens | Planned | N/A | Implemented |
| [`@commoners/audit`](./audit) | Build-time SBOM | Build-time SBOM | Build-time SBOM | Build-time SBOM | Implemented |

## Networking

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| [`@commoners/local-services`](./local-services) | N/A | Bonjour/mDNS | Planned | N/A | Implemented |

## Tauri Support

Most plugins implement Electron desktop hooks but not Tauri equivalents yet. The `DesktopRuntime` abstraction means the plugin IPC pattern (`this.handle`, `this.send`, `this.invoke`) is the same across runtimes — plugins that use only these abstractions work on both Electron and Tauri. Plugins that call `require('electron')` directly need Tauri-specific code paths, which will be added as Tauri adoption grows.

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

# Official Plugins

Official plugins for the Commoners framework. Each plugin provides a cross-platform API that adapts to the current runtime.

## Platform Abstractions

| Plugin | Web | Electron | Tauri | Mobile (Capacitor) | Status |
|--------|-----|----------|-------|-------------------|--------|
| `@commoners/preferences` | IndexedDB | Node fs (JSON) | Planned | @capacitor/preferences | New |
| `@commoners/storage` | File System Access API | Node fs | Planned | @capacitor/filesystem | New |
| `@commoners/clipboard` | navigator.clipboard | electron.clipboard | Planned | @capacitor/clipboard | New |
| `@commoners/notifications` | Notification API | Electron Notification | Planned | @capacitor/local-notifications | New |
| `@commoners/context` | navigator/globals | app.getPath() | Planned | @capacitor/app + device | New |
| `@commoners/messaging` | BroadcastChannel | IPC relay | Planned | BroadcastChannel | New |

## Device Communication

| Plugin | Web | Electron | Tauri | Mobile (Capacitor) | Status |
|--------|-----|----------|-------|-------------------|--------|
| `@commoners/bluetooth` | navigator.bluetooth | Web API + permission bridge | Not supported | @capacitor-community/bluetooth-le | Tested |
| `@commoners/serial` | navigator.serial | Web API + permission bridge | Not supported | Android only (MFi restriction on iOS) | Tested |

## Desktop

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| `@commoners/windows` | window.open() | BrowserWindow + IPC | Planned | N/A | Tested |
| `@commoners/splash-screen` | N/A | Custom BrowserWindow | Planned | N/A | Tested |
| `@commoners/autoupdate` | N/A | electron-updater | Planned | N/A | New |

## Security

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| `@commoners/integrity` | N/A | ASAR + binary hashes | Planned | N/A | Tested (77 tests) |
| `@commoners/secure-services` | N/A | Per-session tokens | Planned | N/A | Tested (15 tests) |
| `@commoners/audit` | Build-time SBOM | Build-time SBOM | Build-time SBOM | Build-time SBOM | New |

## Networking

| Plugin | Web | Electron | Tauri | Mobile | Status |
|--------|-----|----------|-------|--------|--------|
| `@commoners/local-services` | N/A | Bonjour/mDNS (runtime) | Planned | N/A | Tested |

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

## Tauri Support

Most plugins implement Electron desktop hooks but not Tauri equivalents yet. The `DesktopRuntime` abstraction means the plugin IPC pattern (`this.handle`, `this.send`, `this.invoke`) is the same across runtimes — plugins that use only these abstractions work on both. Plugins that call `require('electron')` directly need Tauri-specific code paths, which will be added as Tauri adoption grows.

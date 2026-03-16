# Storage Abstraction: `commoners.storage`

## Design

A cross-platform storage extension declared as a service in `commoners.config.ts`. Consumers get a single API regardless of runtime; the extension selects the appropriate backend.

```ts
// commoners.config.ts
import { StorageService } from '@commoners/storage'

export default {
  services: {
    storage: new StorageService()
  }
}
```

```ts
// Consumer code (any runtime)
const storage = commoners.services.storage

await storage.set('user.preferences', { theme: 'dark', lang: 'en' })
const prefs = await storage.get('user.preferences')
await storage.remove('user.preferences')
const keys = await storage.keys()
await storage.clear()
```

## Extension Declaration

Declared as a commoners extension with capabilities:

```ts
export const capabilities = {
  provides: ['storage', 'persistence', 'key-value'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser', // API consumed from renderer
}
```

## Backend Selection by Runtime

| Runtime | Backend | Why |
|---------|---------|-----|
| **Web (Chrome/Edge)** | IndexedDB | Universal, no quota issues, async |
| **Web (all browsers)** | IndexedDB | OPFS not supported in Safari iOS or mobile WebViews |
| **Electron** | Node `fs` (JSON files) | Native performance, survives app updates, user-inspectable |
| **Tauri** | Rust `tauri-plugin-store` via `invoke()` | Native, fast, Tauri-idiomatic |
| **Mobile (Capacitor)** | `@capacitor/preferences` | Platform-native (NSUserDefaults / SharedPreferences) |

### Why not OPFS everywhere?

OPFS (Origin Private File System) was considered but rejected as the universal backend:
- Not supported in Safari iOS or mobile WebViews (breaks Capacitor apps)
- Not supported in Android WebView
- Works well in Chrome desktop but IndexedDB is equally capable there
- Electron and Tauri have better native alternatives

OPFS could be added as an optional backend for Chrome-only web apps that need high-performance file-level access (e.g., SQLite-over-OPFS), but it's not the default.

## Implementation as Extension

The storage extension is a **hybrid extension** (plugin + service pattern):

```ts
// @commoners/storage/index.ts
export const capabilities = {
  provides: ['storage', 'persistence', 'key-value'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser',
}

export function load() {
  const { DESKTOP, MOBILE, WEB } = commoners

  let backend

  if (DESKTOP) {
    // Electron: IPC to main process for fs-backed storage
    // Tauri: invoke() to tauri-plugin-store
    backend = createDesktopBackend()
  } else if (MOBILE) {
    // Capacitor Preferences plugin
    backend = createMobileBackend()
  } else {
    // IndexedDB for web
    backend = createWebBackend()
  }

  return {
    get: (key) => backend.get(key),
    set: (key, value) => backend.set(key, value),
    remove: (key) => backend.remove(key),
    keys: () => backend.keys(),
    clear: () => backend.clear(),
  }
}

export const desktop = {
  start: function (services) {
    // Register IPC handlers for fs-backed storage in Electron main process
    const store = new Map()
    const storePath = join(this.runtime.app.getPath('userData'), 'commoners-storage.json')

    // Load existing data
    try { Object.assign(store, JSON.parse(readFileSync(storePath, 'utf8'))) } catch {}

    this.handle('get', (_, key) => store.get(key))
    this.handle('set', (_, key, value) => { store.set(key, value); persist() })
    this.handle('remove', (_, key) => { store.delete(key); persist() })
    this.handle('keys', () => [...store.keys()])
    this.handle('clear', () => { store.clear(); persist() })

    function persist() {
      writeFileSync(storePath, JSON.stringify(Object.fromEntries(store)))
    }
  }
}
```

## API

All methods are async (returns Promises):

```ts
interface CommonersStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  set<T = unknown>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
}
```

## Consumer Usage

```ts
// Works identically on web, desktop, and mobile
const { storage } = await commoners.READY

// Simple key-value
await storage.set('session.token', 'abc123')
const token = await storage.get('session.token')

// Structured data
await storage.set('user.settings', { theme: 'dark', fontSize: 14 })
const settings = await storage.get('user.settings')

// Cleanup
await storage.remove('session.token')
await storage.clear()
```

## Dependencies

| Runtime | Peer Dependency | Required |
|---------|----------------|----------|
| Web | None | Built-in (IndexedDB) |
| Electron | None | Built-in (Node fs) |
| Tauri | `tauri-plugin-store` | Optional |
| Mobile | `@capacitor/preferences` | Optional |

Optional dependencies are checked at runtime via `isSupported` gates. If a mobile dependency is missing, the extension falls back to IndexedDB (which works in Capacitor WebViews).

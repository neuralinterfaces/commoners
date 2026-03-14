# Platform Abstractions

Design notes for cross-platform API abstractions that Commoners could provide. These are **documented but not planned for implementation** — they represent natural extensions of the framework's abstraction philosophy once higher-priority work (Vite 8, testing gaps, ASAR hardening) is complete.

---

## Motivation

Commoners already abstracts the *runtime* (Electron, Tauri, Web, Capacitor) and *services* (JS, Python, Rust, C++, WASM). But common platform capabilities — storage, notifications, file access, app metadata — still require per-platform code from the user. Providing thin, typed abstractions would let extensions and apps work across all targets without branching.

**Design principle:** Each abstraction should be:
1. **Declarative** — extensions declare what they need via `capabilities`
2. **Portable** — an extension using `commoners.storage` works on Web, Electron, Tauri, and mobile
3. **Opt-in** — core stays lightweight; abstractions are tree-shakeable or lazy-loaded
4. **Layered** — the API is minimal; users can drop to native APIs via escape hatch

---

## 1. Storage Adapter

**Problem:** Persistent key-value storage differs across targets — `localStorage` (Web), `electron-store` / `fs` (Electron), `@tauri-apps/plugin-store` (Tauri), `@capacitor/preferences` (mobile).

**Proposed API:**

```typescript
// commoners.storage is available on the global object
const storage = commoners.storage

// Simple key-value
await storage.set('theme', 'dark')
const theme = await storage.get('theme')  // 'dark'
await storage.remove('theme')
await storage.clear()

// Namespaced (for extensions)
const ns = storage.namespace('my-plugin')
await ns.set('token', '...')  // Key stored as 'my-plugin:token'
```

**Per-Runtime Implementation:**

| Runtime | Backend | Notes |
|---------|---------|-------|
| Web/PWA | `localStorage` + `IndexedDB` fallback for large values | Sync for small values |
| Electron | `fs` in `app.getPath('userData')` | JSON file per namespace |
| Tauri | `@tauri-apps/plugin-store` | Native Rust-backed store |
| Mobile | `@capacitor/preferences` | Native iOS/Android preferences |

**Capability:** `storage` — extensions declare `capabilities: { requires: ['storage'] }` to signal they need persistent storage.

---

## 2. Notification Adapter

**Problem:** Push and local notifications differ across targets — `Notification` API (Web), Electron `Notification` module, Tauri notification plugin, Capacitor push notifications.

**Proposed API:**

```typescript
const notif = commoners.notifications

// Request permission (returns 'granted' | 'denied' | 'default')
const permission = await notif.requestPermission()

// Send local notification
await notif.send({
  title: 'Export Complete',
  body: 'Your data has been exported to ~/Downloads/export.csv',
  icon: '/icons/success.png',  // optional
})

// Listen for notification interactions
notif.on('click', (event) => { /* handle tap/click */ })
```

**Per-Runtime Implementation:**

| Runtime | Backend | Notes |
|---------|---------|-------|
| Web/PWA | `Notification` API + Service Worker for background | Standard web API |
| Electron | `electron.Notification` | Rich notifications with actions |
| Tauri | `@tauri-apps/plugin-notification` | Native OS notifications |
| Mobile | `@capacitor/local-notifications` / `@capacitor/push-notifications` | Native push support |

**Capability:** `notifications` — extensions declare to signal they send notifications.

---

## 3. Context / Environment Adapter

**Problem:** App metadata and environment info require different APIs per runtime — `app.getPath()` (Electron), `@tauri-apps/api/path` (Tauri), no equivalent on Web.

**Proposed API:**

```typescript
const ctx = commoners.context

// App metadata (available everywhere)
ctx.name        // 'My App' — from commoners.config.ts
ctx.version     // '1.2.3'
ctx.target      // 'electron' | 'tauri' | 'web' | 'ios-capacitor' | ...
ctx.mode        // 'development' | 'production'

// Platform paths (desktop/mobile only — returns null on web)
const dataDir = await ctx.paths.data()      // ~/Library/Application Support/My App/
const cacheDir = await ctx.paths.cache()    // ~/Library/Caches/My App/
const tempDir = await ctx.paths.temp()      // /tmp/My App/
const homeDir = await ctx.paths.home()      // ~/

// OS info
ctx.os.platform  // 'darwin' | 'win32' | 'linux' | 'ios' | 'android' | 'web'
ctx.os.arch      // 'x64' | 'arm64' | ...
```

**Per-Runtime Implementation:**

| Runtime | Backend | Notes |
|---------|---------|-------|
| Web/PWA | Compile-time constants + `navigator` | Paths return `null` |
| Electron | `app.getPath()`, `process.platform` | Full access |
| Tauri | `@tauri-apps/api/path`, `@tauri-apps/plugin-os` | Full access |
| Mobile | `@capacitor/filesystem` + `@capacitor/device` | Subset of paths |

**Note:** Some of this already exists via `commoners.NAME`, `commoners.VERSION`, `commoners.TARGET`. The context adapter would consolidate and extend it with runtime-specific capabilities like paths.

---

## 4. File System Adapter

**Problem:** File read/write requires completely different approaches per target — `fs` (Electron/Node), `@tauri-apps/plugin-fs` (Tauri), `@capacitor/filesystem` (mobile), `File API` / `OPFS` (Web).

**Proposed API:**

```typescript
const fs = commoners.fs

// Read/write (desktop + mobile)
const content = await fs.readTextFile('~/Documents/notes.txt')
await fs.writeTextFile('~/Documents/notes.txt', 'updated content')

// Binary
const bytes = await fs.readFile('~/Downloads/image.png')
await fs.writeFile('~/Downloads/output.bin', bytes)

// File picker (all platforms)
const file = await fs.pick({ filters: [{ name: 'Images', extensions: ['png', 'jpg'] }] })

// Directory listing
const entries = await fs.readDir('~/Documents/')
```

**Per-Runtime Implementation:**

| Runtime | Backend | Notes |
|---------|---------|-------|
| Web/PWA | File System Access API + OPFS fallback | Requires user gesture for pick |
| Electron | Node.js `fs` via IPC | Full access (sandboxed via preload) |
| Tauri | `@tauri-apps/plugin-fs` + `@tauri-apps/plugin-dialog` | Scoped by Tauri security |
| Mobile | `@capacitor/filesystem` | App-scoped directories |

**Capability:** `filesystem` — most restrictive; extensions must explicitly declare this.

**Security note:** File system access is the most sensitive abstraction. On Electron, access goes through the preload bridge (no direct `fs` in renderer). On Tauri, the FS plugin has built-in scope restrictions. The adapter should respect each runtime's security model, not bypass it.

---

## Implementation Strategy

These abstractions should be implemented as **optional packages** (e.g., `@commoners/storage`, `@commoners/notifications`) rather than core features. This keeps core lightweight and lets users opt in.

Each package would:
1. Export a factory function that detects the runtime and returns the correct adapter
2. Register on the `commoners` global during plugin `load()`
3. Tree-shake unused runtime adapters at build time via `__COMMONERS_ELECTRON__` etc.

**Relationship to Device Communication (Batch E):** The BLE/Serial abstractions in [`device-communication-abstraction.md`](./device-communication-abstraction.md) follow the same pattern. These platform abstractions are simpler (no hardware) and could be implemented first as proof-of-concept for the adapter pattern.

---

## Priority Assessment

| Abstraction | User Value | Effort | Dependencies |
|-------------|-----------|--------|-------------|
| Context/Environment | High — consolidates existing scattered APIs | Low | None |
| Storage | High — every app needs persistence | Low-Medium | None |
| Notifications | Medium — common but not universal | Low | None |
| File System | Medium — desktop/mobile focused | Medium | Security review |

**Recommendation:** Start with Context (mostly renaming/consolidating existing globals) and Storage (small API surface, clear per-runtime backends). Defer File System until the security model for each runtime is well-understood.

# Runtime Abstraction Completion (Done — Phase 3)

Implementation plan for finishing the `DesktopRuntime` interface so that all Electron-specific code in `main.ts` is routed through the runtime adapter. This was a prerequisite for the Tauri desktop backend (Phase 2, also complete).

**Status:** Complete. All Electron API calls in `main.ts` are routed through the runtime. Plugin context `runtime` parameter is required. IPC send abstracted via `setSendToRenderer()`. Typed Command Registry and Capabilities-Driven IPC Allowlist also implemented as follow-up work.

---

## What Was Done

### Phase 1 (Service IPC Routing)

Routed service and plugin IPC through `runtime.scopedIPC`:
- `runtime.scopedIPC.serviceSend()`, `runtime.scopedIPC.serviceOn()`
- `runtime.scopedIPC.pluginSend()`, `runtime.scopedIPC.pluginOn()`, `runtime.scopedIPC.pluginHandle()`

### Phase 2 (App Lifecycle, Protocol, Shell, Dialog, Session, Window Enumeration)

Routed application-level calls through runtime namespaces:
- `runtime.app.*` — setName, setAppUserModelId, commandLine.appendSwitch
- `runtime.lifecycle.*` — onReady, onActivate, onBeforeQuit, quit, exit
- `runtime.protocol.*` — registerScheme, handleRequest, fetch
- `runtime.session.setupCSP()`, `runtime.dialog.showErrorBox()`, `runtime.shell.openExternal()`
- `runtime.ipc.*` — on, once (all IPC listeners)
- `runtime.window.getAll()`

### Phase 3 (Window Creation, Events, Page Loading, Plugin Context)

Expanded `RuntimeWindow` interface with 8 new methods:

| Method | Purpose |
|--------|---------|
| `show(win)` | Show a window |
| `isDestroyed(win)` | Check if window is destroyed |
| `loadURL(win, url)` | Load a URL in a window |
| `onClose(win, callback)` | Listen for window close |
| `onReadyToShow(win, callback)` | Listen for ready-to-show |
| `onNavigate(win, handler)` | Listen for will-navigate |
| `onWebContentsEvent(win, event, handler)` | Listen for webContents events |
| `setWindowOpenHandler(win, handler)` | Set window open handler |
| `sendToRenderer(win, channel, ...args)` | Send IPC to renderer |

Key changes:
- **`ElectronWindow.create()`** — Working implementation replacing the previous throwing stub. Creates `BrowserWindow` with provided options.
- **`main.ts`** — ~15 direct Electron calls replaced with `runtime.window.*` methods.
- **`plugins.ts`** — `runtime` parameter made required (was optional). Removed all direct IPC fallback paths.
- **`ipc.ts`** — Added `setSendToRenderer()` for configurable renderer send function, used by `runtime.window.sendToRenderer`.
- **`TauriWindow`** — Stubs added for all new methods (no-op or Tauri-equivalent).

### Follow-up: Typed Command Registry

All IPC channel strings replaced with typed `Commands.*` references:
- `Commands.quit.channel`, `Commands.close.channel`, `Commands.services.channel`, etc.
- `ScopedCommands.service(id, attr)` and `ScopedCommands.plugin(id, channel)` builders
- `FRAMEWORK_CHANNELS` constant, `isFrameworkChannel()`, `validateCommand()` helpers
- File: `packages/core/assets/electron/modules/commands.ts`

### Follow-up: Capabilities-Driven IPC Allowlist

Per-extension IPC channel validation from config:
- `generateIPCAllowlist(pluginIds, serviceIds)` builds allowlist from config
- Main process validates via `IPC.setIPCAllowlist()`
- Preload receives allowlist via `additionalArguments` and validates scoped channels against declared plugin/service IDs
- Falls back to prefix-based check for backward compatibility
- File: `packages/core/assets/electron/modules/ipc-allowlist.ts`

### Follow-up: Plugin Capability Declaration

Capabilities added to 3 official plugins:
- Windows: `{ provides: ['windows', 'multi-window'], platforms: { web: true, desktop: true } }`
- Splash Screen: `{ provides: ['splash-screen', 'loading-screen'], platforms: { desktop: true } }`
- Local Services: `{ provides: ['local-services', 'service-discovery', 'mdns'], platforms: { desktop: true } }`

Plus `validateRequirements()` utility and dev-mode warning for extensions without capabilities.

### Preload `sendSync` Decision

The 3 `sendSync` calls in `preload.ts` were evaluated and documented as a `PreloadContract` interface in `types.ts`. Each runtime provides initialization data through its own mechanism — Electron uses `sendSync`, Tauri uses Rust-provided globals. The synchronous requirement is real (preload must have data before page load), so it was abstracted conceptually rather than eliminated.

---

## Verification (All Passing)

- [x] Zero direct `app.*` calls remain in `main.ts` (all go through `runtime.app.*`)
- [x] `createWindow` delegates to `runtime.window.create()`
- [x] Protocol handling routes through `runtime.protocol.*`
- [x] Plugin `desktop.load` receives context with required `runtime` parameter
- [x] Preload synchronous data fetching documented as `PreloadContract`
- [x] All existing tests pass (284 tests across 8 test files)
- [x] `runtime.native` escape hatch provides raw Electron access where needed
- [ ] Plugin protocol sub-routes registerable via `runtime.protocol.registerPluginRoute()` (deferred — not yet needed)

---

## Remaining Work

| Item | Status |
|------|--------|
| Plugin protocol sub-route registration | Deferred — better suited after full Tauri runtime parity |
| Complete `createTauriRuntime()` adapter | Planned — requires Tauri-side implementation for all runtime methods |

---

## Files Modified

| File | Change |
|------|--------|
| `packages/core/assets/runtime/types.ts` | Added 8 new `RuntimeWindow` methods + `PreloadContract` interface |
| `packages/core/assets/runtime/electron.ts` | Implemented `create()` + all new methods in `ElectronWindow` |
| `packages/core/assets/runtime/tauri.ts` | Added stubs for all new `RuntimeWindow` methods |
| `packages/core/assets/electron/main.ts` | Replaced ~15 direct Electron calls, migrated to `Commands.*` channels, added IPC allowlist |
| `packages/core/assets/electron/modules/plugins.ts` | Made `runtime` required, removed IPC fallbacks |
| `packages/core/assets/electron/modules/ipc.ts` | Added `setSendToRenderer()`, `setIPCAllowlist()`, `checkAllowlist()` |
| `packages/core/assets/electron/modules/commands.ts` | New — Typed Command Registry |
| `packages/core/assets/electron/modules/ipc-allowlist.ts` | New — Capabilities-Driven IPC Allowlist |
| `packages/core/assets/electron/modules/ipc-channels.ts` | Updated to use `Commands.*` references |
| `packages/core/assets/electron/preload.ts` | Added allowlist parsing and fine-grained channel validation |
| `packages/core/assets/capabilities.ts` | Added `validateRequirements()` |
| `packages/core/index.ts` | Added dev-mode capability warning |
| `packages/plugins/windows/index.ts` | Added capabilities declaration |
| `packages/plugins/splash-screen/index.ts` | Added capabilities declaration |
| `packages/plugins/local-services/index.ts` | Added capabilities declaration |

# Electron Coupling Audit

Technical reference for [Phase 1 of the Tauri integration roadmap](./features.md). This document catalogs every Electron-specific integration point in the Commoners codebase, assesses abstraction quality, and identifies what must change to support Tauri as an alternative desktop runtime.

**Summary:** ~25-35% of the codebase is Electron-specific. ~65-75% is target-agnostic. Electron code is compartmentalized in specific modules, not deeply woven throughout. A Tauri backend can be added alongside Electron without a rewrite.

---

## 1. Electron Code Footprint

### Direct Electron Implementation (~2,000-2,500 lines)

#### Core Electron Assets (`packages/core/assets/electron/`)

| File | Lines | Purpose |
|------|-------|---------|
| `main.ts` | ~460 | Main process orchestration: window creation, service launching, app lifecycle |
| `preload.ts` | ~144 | Preload script: exposes IPC bridge via `contextBridge` |
| `security.ts` | ~105 | Security hardening: CSP, context isolation, sandbox |
| `modules/config.ts` | ~118 | Config loading and parsing in main process |
| `modules/ipc.ts` | ~199 | IPC channel management (`ipcMain`, `ipcRenderer`, `BrowserWindow.getAllWindows()`) |
| `modules/window.ts` | ~212 | Window lifecycle management, single instance enforcement |
| `modules/plugins.ts` | ~207 | Plugin integration: creates plugin contexts with Electron references |
| `modules/lifecycle.ts` | ~178 | App lifecycle hooks |
| `modules/protocol.ts` | ~133 | Custom protocol handling |
| `modules/security.ts` | ~132 | Security module |
| **Total** | **~1,888** | |

#### Build & Launch Strategies

| File | Lines | Purpose |
|------|-------|---------|
| `ElectronBuildStrategy.ts` | ~425 | electron-builder packaging, ASAR integrity, code signing, icon handling |
| `ElectronLaunchStrategy.ts` | ~80 | Launch built Electron apps |
| **Total** | **~505** | |

#### Vite Electron Plugin (`packages/core/vite/plugins/electron/`)

| Purpose | Lines |
|---------|-------|
| Dev server integration, hot reloading, Electron instance startup | ~350+ |
| Builds `main.ts` and `preload.ts` as separate CommonJS bundles | |

#### Configuration & Build Files

- `electron-builder.yml` -- Packaging configuration
- `build/notarize.cjs` -- macOS notarization
- `build/entitlements.mac.plist` -- macOS entitlements

#### Dependencies (`packages/core/package.json`)

```
electron: ^40.8.0
electron-builder: ^26.8.1
@electron-toolkit/utils: ^4.0.0
@electron-toolkit/tsconfig: ^1.0.1
@electron/asar: ^4.1.0
@electron/fuses: ^2.1.0
@electron/notarize: ^3.1.1
electron-builder-squirrel-windows: ^26.0.0
```

---

## 2. Integration Point Analysis

### A. Service Communication (Moderately Coupled)

**Location:** `main.ts` lines ~380-435, `preload.ts` lines ~83-112

Services are resolved and created with an IPC bridge for inter-process messaging. Services communicate to renderer via `commoners:services` IPC channel.

**Key finding:** Service resolution itself is target-agnostic. Only the IPC bridge between main process and renderer is Electron-specific. The service orchestration layer (`packages/core/assets/services/`) uses Node.js `spawn()`/`fork()` which runs in Electron's main process but could equally run in any Node.js environment.

**For Tauri:** Services would be launched via `@tauri-apps/plugin-shell` sidecar API from the frontend, or via a custom Rust plugin that manages child processes. The service resolution logic is reusable.

### B. Plugin System (Well Abstracted)

**Location:** `modules/plugins.ts` (~207 lines)

Creates plugin contexts with:
- `DESKTOP`, `MOBILE`, `WEB` boolean flags
- `electron` and `utils` references from `@electron-toolkit`
- `createWindow`, `send`, `on`, `invoke` methods

**Plugins that are Electron-aware:**
- `packages/plugins/windows/index.ts` -- Separate code paths for `DESKTOP` vs `WEB`
- `packages/plugins/autoupdate/index.js` -- Uses `electron-updater`, only runs in `desktop` hook
- `packages/plugins/splash-screen/index.ts` -- Only runs in `desktop` target
- `packages/plugins/devices/ble/index.ts` -- Uses `webContents.on('select-bluetooth-device')`
- `packages/plugins/devices/serial/index.ts` -- Uses `session.on('select-serial-port')`

**Abstraction quality:** Good. Plugins check platform flags and can disable features per platform. The `isSupported` mechanism already allows plugins to declare which platforms they work on.

**For Tauri:** The plugin context interface would need a Tauri implementation. The `send`/`on`/`invoke` methods would dispatch to Tauri's `invoke`/`listen` instead of `ipcRenderer`. Platform flags (`DESKTOP`, `MOBILE`, `WEB`) remain the same.

### C. Window Management (Abstracted via RuntimeWindow)

**Location:** `main.ts`, `modules/window.ts` (~212 lines), `runtime/electron.ts`, `runtime/types.ts`

Window management is now routed through the `RuntimeWindow` interface. `main.ts` uses `runtime.window.create()`, `runtime.window.show()`, `runtime.window.loadURL()`, `runtime.window.onClose()`, `runtime.window.onNavigate()`, `runtime.window.onWebContentsEvent()`, `runtime.window.setWindowOpenHandler()`, and `runtime.window.sendToRenderer()`. No direct `BrowserWindow` instantiation remains in `main.ts`.

**For Tauri:** `TauriWindow` stubs exist in `runtime/tauri.ts`. Implementation needs to map to Tauri's `WebviewWindow` API — the interface is defined and ready.

### D. IPC System (Abstracted via Runtime + Typed Commands)

**Location:** `modules/ipc.ts` (~309 lines), `modules/commands.ts` (~100 lines), `modules/ipc-allowlist.ts` (~80 lines), `main.ts`, `preload.ts`

**Current state:** IPC is now fully abstracted behind the `DesktopRuntime` interface:
- `runtime.ipc.*` — `on`, `once` for main-process IPC listeners
- `runtime.scopedIPC.*` — `serviceSend`, `serviceOn`, `pluginSend`, `pluginOn`, `pluginHandle` for scoped messaging
- `IPC.setSendToRenderer()` — configurable renderer send function
- `IPC.setIPCBackend()` — configurable IPC main and window accessor
- `IPC.setIPCAllowlist()` — capabilities-driven channel validation

**Typed Command Registry:** All IPC channel strings replaced with typed `Commands.*` references (`Commands.quit.channel`, `Commands.services.channel`, etc.). `ScopedCommands` builders for service/plugin channels.

**Capabilities-Driven IPC Allowlist:** Per-extension channel validation generated from config. Main process validates via `IPC.setIPCAllowlist()`. Preload validates scoped channels against declared plugin/service IDs with prefix-based fallback.

**For Tauri:** The abstraction layer now exists. Tauri's `invoke()` / `listen()` / `emit()` can be wired in via `setIPCBackend()` and `setSendToRenderer()`. The typed command definitions in `commands.ts` provide a shared contract.

### E. Build Pipeline (Tightly Coupled)

**Location:** `ElectronBuildStrategy.ts` (~425 lines)

Directly uses `electron-builder`:
- Generates electron-builder config (lines ~123-221)
- ASAR integrity validation (lines ~383-423)
- Code signing configuration (lines ~352-378)
- Platform-specific icon handling

**For Tauri:** Complete replacement with `TauriBuildStrategy` that generates `tauri.conf.json` and invokes `tauri build`. The Strategy pattern already in use makes this clean.

### F. Security (Electron-Specific)

**Location:** Security modules (~264 lines total)

Context isolation, sandbox, `nodeIntegration` settings, CSP configuration.

**For Tauri:** Tauri handles security differently (Rust-side capability system, no `nodeIntegration` concept). The security module would be replaced, but Tauri's model is arguably more secure by default.

---

## 3. Abstraction Quality Assessment

### Already Well Abstracted
| Component | Evidence |
|-----------|----------|
| Target selection | `validDesktopTargets = ['desktop', 'electron', 'tauri']` in `types.ts`; `isDesktop(target)` helper; `TARGET_ELECTRON`, `TARGET_TAURI` constants exist |
| Plugin platform flags | Plugins receive `DESKTOP`, `MOBILE`, `WEB` booleans and conditionally execute |
| Service layer | Service resolution is target-agnostic; only IPC bridge is Electron-specific |
| Configuration | `config.electron` namespace separates Electron-specific options from main config |
| Build/Launch flow | Strategy pattern can accommodate `TauriBuildStrategy` / `TauriLaunchStrategy` |

### Abstracted (Completed)
| Component | Current State | How |
|-----------|--------------|-----|
| Main process code | All Electron APIs routed through `DesktopRuntime` | `runtime.app.*`, `runtime.window.*`, `runtime.lifecycle.*`, etc. |
| IPC communication | Fully abstracted with typed commands | `runtime.ipc.*`, `runtime.scopedIPC.*`, `Commands.*`, `IPC.setIPCBackend()` |
| Window management | `RuntimeWindow` interface implemented | `runtime.window.create()`, `.show()`, `.loadURL()`, `.onNavigate()`, etc. |
| Build strategy | Electron + Tauri strategies exist | `TauriBuildStrategy`, `TauriLaunchStrategy`, `TauriDevStrategy` |
| Preload script | Documented as `PreloadContract` | Each runtime provides init data through its own mechanism |
| Plugin context | `runtime` parameter required | No more direct IPC fallbacks; all goes through `runtime.scopedIPC.*` |

### NOT Yet Abstracted (Remaining)
| Component | Current State | Needed |
|-----------|--------------|--------|
| Plugin protocol sub-routes | Not implemented | `runtime.protocol.registerPluginRoute()` |
| Complete Tauri runtime adapter | Stubs exist | Full `createTauriRuntime()` for runtime parity |

---

## 4. Migration Effort Estimate

### Completed Work

| Category | Status |
|----------|--------|
| Define interfaces (`DesktopRuntime`, `RuntimeWindow`, `RuntimeScopedIPC`, `PreloadContract`) | Done |
| Refactor Electron code behind interfaces (all `main.ts` calls routed through runtime) | Done |
| Typed Command Registry (`Commands.*` replacing string literals) | Done |
| Capabilities-Driven IPC Allowlist (per-extension channel validation) | Done |
| Plugin Capability Declaration (3 official plugins + validation) | Done |
| Tauri build strategy (`TauriBuildStrategy`, `TauriMobileBuildStrategy`) | Done |
| Tauri testing adapter (WebDriver-based via `tauri-driver`) | Done |

### Remaining Work

| Category | Scope | Estimated Effort |
|----------|-------|-----------------|
| Complete `createTauriRuntime()` | Full runtime adapter with Tauri IPC, window management, lifecycle | Medium |
| Plugin protocol sub-routes | `runtime.protocol.registerPluginRoute()` | Low |
| Tauri-side IPC integration | Wire `invoke()`/`listen()`/`emit()` into runtime adapter | Medium |

**Key finding:** 65-75% of `packages/core/` does NOT need to change. The abstraction layer is now complete on the Electron side — remaining work is implementing the Tauri side of each interface.

---

## 5. File Reference

Files that import from Electron or use Electron-specific APIs:

```
packages/core/
├── assets/electron/
│   ├── main.ts                          # Main process entry point (all calls via runtime)
│   ├── preload.ts                       # Context bridge + IPC allowlist validation
│   ├── security.ts                      # Security hardening
│   └── modules/
│       ├── config.ts                    # Main process config
│       ├── commands.ts                  # Typed Command Registry
│       ├── ipc.ts                       # IPC channel management (abstracted)
│       ├── ipc-allowlist.ts             # Capabilities-driven IPC allowlist
│       ├── ipc-channels.ts             # Channel validation registry
│       ├── window.ts                    # BrowserWindow lifecycle
│       ├── plugins.ts                   # Plugin context creation (runtime required)
│       ├── lifecycle.ts                 # App lifecycle hooks
│       ├── protocol.ts                  # Custom protocol handling
│       └── security.ts                  # Security module
├── assets/runtime/
│   ├── types.ts                         # DesktopRuntime + RuntimeWindow interface
│   ├── electron.ts                      # Electron runtime adapter
│   └── tauri.ts                         # Tauri runtime adapter (stubs)
├── strategies/
│   ├── ElectronBuildStrategy.ts         # electron-builder packaging
│   ├── ElectronLaunchStrategy.ts        # Launch built apps
│   ├── TauriBuildStrategy.ts            # Tauri build strategy
│   ├── TauriMobileBuildStrategy.ts      # Tauri mobile build strategy
│   └── TauriLaunchStrategy.ts           # Launch built Tauri apps
├── vite/plugins/electron/               # Vite dev integration
└── types.ts                             # Type definitions (TARGET_ELECTRON, TARGET_TAURI)

packages/plugins/
├── devices/ble/index.ts                 # webContents.on('select-bluetooth-device')
├── devices/serial/index.ts              # session.on('select-serial-port')
├── windows/index.ts                     # BrowserWindow manipulation
├── autoupdate/index.js                  # electron-updater
└── splash-screen/index.ts              # BrowserWindow for splash

Files that do NOT need to change:
├── assets/services/                     # Service orchestration (target-agnostic)
├── assets/onload.ts                     # Renderer plugin loader (target-agnostic)
├── index.ts                             # Config resolution (target-agnostic)
├── build.ts                             # Build orchestration (uses Strategy pattern)
├── launch.ts                            # Launch orchestration (uses Strategy pattern)
└── utils/                               # Utility functions (target-agnostic)
```

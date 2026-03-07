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

### C. Window Management (Tightly Coupled)

**Location:** `main.ts` lines ~174-332, `modules/window.ts` (~212 lines)

Direct `BrowserWindow` instantiation, `win.webContents.on()` event handling, single instance enforcement via Electron API.

**For Tauri:** Complete replacement needed. Tauri's `WebviewWindow` API is different but provides equivalent functionality (window creation, event handling, multi-window support).

### D. IPC System (Very Tightly Coupled, No Abstraction)

**Location:** `modules/ipc.ts` (~199 lines), `main.ts` lines ~338-368, `preload.ts` lines ~1-80

Direct use of `ipcMain`, `ipcRenderer`, `BrowserWindow.getAllWindows()`. No abstraction layer exists.

**For Tauri:** This is the **biggest blocker** for Phase 1. Needs an abstraction that dispatches to either:
- Electron: `ipcRenderer.send()` / `ipcMain.on()` / `ipcRenderer.invoke()` / `ipcMain.handle()`
- Tauri: `invoke()` / `listen()` / `emit()`

The communication patterns are fundamentally different (Electron is bidirectional main↔renderer, Tauri is command-based frontend→backend with event-based backend→frontend).

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

### NOT Abstracted (Must Be Done in Phase 1)
| Component | Current State | Needed |
|-----------|--------------|--------|
| Main process code | Direct Electron APIs throughout `main.ts` | Runtime-specific entry points |
| IPC communication | No abstraction over `ipcMain`/`ipcRenderer` | `RuntimeIPC` interface with `send`/`on`/`invoke` |
| Window management | Direct `BrowserWindow` usage | `RuntimeWindow` interface |
| Build strategy | `ElectronBuildStrategy` only | `TauriBuildStrategy` (Strategy pattern already supports this) |
| Preload script | Exposes `ipcRenderer` to global scope | Tauri has no preload concept; uses `invoke` directly |
| Plugin context | Receives `electron` module reference | Needs runtime-agnostic context with equivalent methods |

---

## 4. Migration Effort Estimate

### Breakdown by effort level

| Category | Scope | Estimated Effort |
|----------|-------|-----------------|
| Trivial refactoring | Types, constants, config parsing | ~5% of Electron code |
| Moderate refactoring | Lifecycle hooks, protocol handling, service IPC bridge | ~10% |
| New parallel implementation | Tauri main process, IPC, window management, build strategy, plugin context | ~85% (new code, not rewriting existing) |

### Total estimate

The existing Electron code does NOT need to be rewritten. The work is:
1. **Define interfaces** (~1-2 days): `DesktopRuntime`, `RuntimeIPC`, `RuntimeWindow`, `RuntimePluginContext`
2. **Refactor Electron code behind interfaces** (~2-3 days): Wrap existing code, no behavior changes
3. **Implement Tauri equivalents** (~2-3 weeks): New `packages/core/assets/tauri/` directory
4. **Test and debug** (~1-2 weeks): Cross-runtime compatibility, service lifecycle, plugin system

**Key finding:** 65-75% of `packages/core/` does NOT need to change. The compartmentalization is clean enough that Tauri support is an addition, not a rewrite.

---

## 5. File Reference

Files that import from Electron or use Electron-specific APIs:

```
packages/core/
├── assets/electron/
│   ├── main.ts                          # Main process entry point
│   ├── preload.ts                       # Context bridge + IPC exposure
│   ├── security.ts                      # Security hardening
│   └── modules/
│       ├── config.ts                    # Main process config
│       ├── ipc.ts                       # IPC channel management
│       ├── window.ts                    # BrowserWindow lifecycle
│       ├── plugins.ts                   # Plugin context creation
│       ├── lifecycle.ts                 # App lifecycle hooks
│       ├── protocol.ts                  # Custom protocol handling
│       └── security.ts                  # Security module
├── strategies/
│   ├── ElectronBuildStrategy.ts         # electron-builder packaging
│   └── ElectronLaunchStrategy.ts        # Launch built apps
├── vite/plugins/electron/               # Vite dev integration
└── types.ts                             # Type definitions (already has TARGET_TAURI)

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

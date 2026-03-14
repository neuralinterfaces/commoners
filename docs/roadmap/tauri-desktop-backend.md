# Tauri Desktop Backend (Phase 2)

Implementation plan for adding Tauri as an alternative desktop runtime alongside Electron. Builds on the completed runtime abstraction (Phase 1).

**Prerequisites:** Runtime abstraction complete (Phase 1/3 done).

**Reference documents:**
- [Tauri Integration Reference](./tauri-integration-reference.md) — sidecar system, code signing, mobile plugin maturity

This document covers implementation specifics. It does NOT duplicate the analysis in the reference documents.

---

## Problem

Commoners currently only supports Electron for desktop builds. Tauri offers significantly smaller binaries (~2-10 MB base vs ~60-150 MB) and a stronger security model (Rust backend, capability-based permissions). For applications that don't use Web Bluetooth/Serial/USB/HID APIs, Tauri is the better choice. The runtime abstraction (Phase 1) makes the desktop backend swappable — this plan implements the Tauri adapter.

---

## Current State

- `DesktopRuntime` interface defined with app lifecycle, window, protocol, shell, IPC, and plugin context namespaces
- `createElectronRuntime()` is the only adapter
- `TARGET_TAURI` constant and `isDesktop(target)` helper already exist in `types.ts`
- `validDesktopTargets = ['desktop', 'electron', 'tauri']` — Tauri is a recognized target
- Strategy pattern for build/launch already supports multiple implementations
- Service orchestration layer (`packages/core/assets/services/`) is target-agnostic

---

## Implementation Plan

### Step 1: `TauriBuildStrategy`

**Goal:** Generate a complete Tauri project from `commoners.config.ts` and build it.

**Auto-generate `tauri.conf.json`:**
- `productName`, `version`, `identifier` from commoners config
- `bundle.externalBin` from resolved services (compiled binaries)
- `bundle.icon` from commoners config icon paths
- `app.windows[0]` from commoners window options
- `app.security.csp` from commoners CSP config
- `plugins.shell.scope` with sidecar permissions for each service

**Auto-generate `src-tauri/capabilities/default.json`:**
- `shell:allow-spawn` permission for each service binary
- Argument validators based on service configuration

**Service binary naming:**
- Use `rustc --print host-tuple` to determine target triple
- Copy compiled service binaries to `src-tauri/binaries/` with correct naming convention
- Handle cross-compilation scenarios (build for different target triple)

**Build invocation:**
- `tauri build` with appropriate flags
- Pre-sign sidecar binaries on macOS before `tauri build` (see [Tauri reference, Section 2](./tauri-integration-reference.md))

**Files:**
- `packages/core/strategies/TauriBuildStrategy.ts` (new)
- `packages/core/templates/tauri.conf.json` (template, new)
- `packages/core/templates/capabilities.json` (template, new)

### Step 2: `TauriLaunchStrategy`

**Goal:** Launch built Tauri applications for testing and development.

1. Locate the built binary in `src-tauri/target/release/bundle/`
2. Spawn the binary as a child process
3. Attach stdout/stderr handlers for logging
4. Implement graceful shutdown (SIGTERM → SIGKILL fallback, reuse `treeKillGracefully` pattern)

**Files:**
- `packages/core/strategies/TauriLaunchStrategy.ts` (new)

### Step 3: `createTauriRuntime()` Adapter

**Goal:** Implement the `DesktopRuntime` interface for Tauri.

**Key differences from Electron:**

| Runtime Method | Electron Implementation | Tauri Implementation |
|---------------|------------------------|---------------------|
| `app.whenReady()` | `electron.app.whenReady()` | Rust `setup()` hook or `tauri::async_runtime` |
| `window.create()` | `new BrowserWindow(options)` | `WebviewWindow::new()` via `@tauri-apps/api/window` |
| `protocol.handle()` | `electron.protocol.handle()` | Rust `register_asynchronous_uri_scheme_protocol()` |
| `shell.openExternal()` | `electron.shell.openExternal()` | `@tauri-apps/plugin-opener` |
| `scopedIPC.serviceSend()` | `ipcMain.on()` + `webContents.send()` | `invoke()` + `listen()` + `emit()` |
| `scopedIPC.pluginInvoke()` | `ipcRenderer.invoke()` + `ipcMain.handle()` | `invoke()` command pattern |
| `createPluginContext()` | Wraps `BrowserWindow` + IPC | Wraps Tauri window + invoke/listen |
| Sync preload data | `ipcRenderer.sendSync()` | Rust `setup()` injects into `__TAURI_INTERNALS__` or `window.__COMMONERS__` |

**Architecture:**
- Tauri runtime adapter lives in `packages/core/assets/tauri/`
- Mirrors the Electron module structure but with Tauri equivalents
- Service lifecycle managed via `@tauri-apps/plugin-shell` sidecar API (see [Tauri reference, Section 1](./tauri-integration-reference.md))

**Files:**
- `packages/core/assets/tauri/runtime.ts` (new)
- `packages/core/assets/tauri/modules/` (new directory mirroring electron modules)

### Step 4: Vite Dev Plugin for Tauri

**Goal:** Hot-reloading development experience equivalent to the Electron Vite plugin.

1. Mirror `packages/core/vite/plugins/electron/` structure
2. On dev server start: invoke `tauri dev` pointing to the Vite dev server URL
3. On file change: Tauri's built-in hot-reload handles Rust changes; web changes use Vite HMR
4. `closeBundle` hook triggers Tauri restart when main process code changes

**Files:**
- `packages/core/vite/plugins/tauri/index.ts` (new)

### Step 5: Service Lifecycle via Sidecar API

**Goal:** Adapt Commoners' service orchestration to use Tauri's sidecar system.

**Compiled services (Rust, C++, Python):**
- Launched via `Command.sidecar('binaries/<service-name>', args).spawn()`
- stdout/stderr event streams for monitoring
- `child.kill()` for shutdown (with orphan process workaround for PyInstaller)

**JavaScript services (Node.js):**
- No `fork()` available (Tauri has no Node.js in main process)
- Compile JS services to SEA (Single Executable Application)
- Launch via sidecar like any other compiled service
- Communicate over HTTP (URL-based pattern already standard in Commoners)

**Service health checks:**
- Reuse Commoners' existing `waitForService()` retry utility
- Poll service URLs on expected ports
- Tauri's sidecar API lacks built-in health checks (see [Tauri reference, Section 2.3](./tauri-integration-reference.md))

**Files:**
- Service orchestration adaptations in `packages/core/assets/tauri/modules/services.ts` (new)

### Step 6: Testing

**Goal:** Verify Tauri builds and launches work end-to-end.

1. Add `tests/tauri.test.ts` with build + launch tests
2. Verify services start and respond via sidecar
3. Verify `commoners` global is accessible from WebView
4. Verify plugin loading and IPC communication
5. Run alongside Electron tests (separate target flag)

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `packages/core/strategies/TauriBuildStrategy.ts` | Create | Build strategy with `tauri.conf.json` generation |
| `packages/core/strategies/TauriLaunchStrategy.ts` | Create | Launch strategy for built Tauri apps |
| `packages/core/assets/tauri/runtime.ts` | Create | `createTauriRuntime()` adapter |
| `packages/core/assets/tauri/modules/` | Create | Tauri module equivalents (IPC, window, lifecycle, etc.) |
| `packages/core/vite/plugins/tauri/index.ts` | Create | Vite dev integration for Tauri |
| `packages/core/templates/tauri.conf.json` | Create | Template for auto-generated config |
| `packages/core/templates/capabilities.json` | Create | Template for Tauri capabilities |
| `tests/tauri.test.ts` | Create | E2E tests for Tauri build+launch |
| `packages/core/types.ts` | Modify | Any new types needed for Tauri target |
| `packages/core/build.ts` | Modify | Register `TauriBuildStrategy` |
| `packages/core/launch.ts` | Modify | Register `TauriLaunchStrategy` |

---

## Dependencies

- **Requires:** Runtime abstraction (done) — full `DesktopRuntime` interface
- **Blocked by:** Nothing external (Tauri v2 is stable)
- **Blocks:** [Device Communication Abstraction](./device-communication-abstraction.md) (Phase 3)
- **NPM deps:** `@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-opener`

---

## Verification

- [ ] `commoners --target tauri` builds a functional Tauri app
- [ ] Auto-generated `tauri.conf.json` includes correct `externalBin` entries
- [ ] Sidecar services start and respond to HTTP requests
- [ ] JS services work as SEA sidecars (no `fork()`)
- [ ] `commoners` global is accessible in Tauri WebView
- [ ] Plugin IPC works through `invoke()`/`listen()` pattern
- [ ] Dev mode hot-reloads correctly
- [ ] macOS sidecar binaries are pre-signed before `tauri build`
- [ ] Tauri tests pass alongside existing Electron tests

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Tauri WebView lacks Web Bluetooth/Serial/USB/HID on macOS/Linux | Document clearly; Electron remains default for hardware apps; Phase 3 adds abstraction |
| Sidecar code-signing issues on macOS ([issue #11992](https://github.com/tauri-apps/tauri/issues/11992)) | Pre-sign binaries; monitor Tauri issue tracker |
| PyInstaller orphan processes ([issue #11686](https://github.com/tauri-apps/tauri/issues/11686)) | Recommend `--onedir`; implement Python-side parent monitoring |
| JS service SEA compilation adds build complexity | Commoners already has SEA compilation; extend existing infrastructure |
| Maintaining two desktop runtimes doubles surface area | Share service orchestration; only runtime adapter code is duplicated |
| Tauri's IPC model (command-based) differs from Electron's (bidirectional) | `DesktopRuntime` abstracts this; adapter handles translation |

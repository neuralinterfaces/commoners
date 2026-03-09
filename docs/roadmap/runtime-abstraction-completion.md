# Runtime Abstraction Completion (Phase 1)

Implementation plan for finishing the `DesktopRuntime` interface so that all Electron-specific code in `main.ts` is routed through the runtime adapter. This is a prerequisite for the Tauri desktop backend (Phase 2).

---

## Problem

Phase 1 of the runtime abstraction started: `DesktopRuntime` interface exists, `createElectronRuntime()` implements it, and service IPC is routed through `runtime.scopedIPC`. However, the majority of Electron API calls in `main.ts` remain direct, and several architectural gaps block Tauri integration:

1. **~18 direct Electron API calls** in `main.ts` bypass the runtime entirely
2. **3 `sendSync` calls** in `preload.ts` need evaluation (synchronous data fetches during initialization)
3. **Plugin `desktop.load` hooks** receive raw `BrowserWindow` — need `RuntimePluginContext` wrapping
4. **Plugin protocol sub-route registration** via `RuntimeProtocol` (deferred from custom protocol work)
5. **`createWindow`** is a local function in `main.ts`, not delegated through the runtime

---

## Current State

### What's Routed Through Runtime

| API | Runtime Method | Location |
|-----|---------------|----------|
| Service IPC send | `runtime.scopedIPC.serviceSend()` | `main.ts` lines 431-432, 443-444 |
| Service IPC listen | `runtime.scopedIPC.serviceOn()` | `main.ts` lines 443-444 |

### What's Called Directly (Not Through Runtime)

| Electron API | Usage | Lines in `main.ts` |
|-------------|-------|---------------------|
| `app.commandLine.appendSwitch()` | Remote debugging port (testing) | 65-67 |
| `app.setName()` | Set app name | 416 |
| `app.setAppUserModelId()` | Windows app model ID | 451 |
| `app.whenReady()` | Wait for app ready | 424 |
| `app.on('activate')` | macOS dock click | 526 |
| `app.on('before-quit')` | Quit lifecycle | 538 |
| `app.exit()` | Force exit | 547 |
| `new BrowserWindow()` | Window creation | 247 |
| `win.webContents.on()` | Multiple event handlers | 252-329 |
| `win.webContents.send()` | IPC to renderer (via IPC.send) | 361 |
| `win.loadURL()` | Load page content | 162, 175, 277, 306 |
| `win.close()` / `win.show()` / `win.once()` | Window lifecycle | 319-381 |
| `shell.openExternal()` | Open external URLs | 276, 327 |
| `ipcMain.on()` / `ipcMain.once()` | IPC listeners | 324, 379, 385-405 |
| `electron.protocol.handle()` | Custom protocol | 453 |
| `electron.net.fetch()` | Protocol proxy requests | 465, 481, 516 |

### Preload `sendSync` Calls

| Line | Call | Purpose |
|------|------|---------|
| 41 | `ipcRenderer.sendSync('commoners:services')` | Fetch services metadata |
| 42 | `ipcRenderer.sendSync('commoners:location', __id)` | Fetch window location |
| 85 | `ipcRenderer.sendSync('services:${id}:status')` | Get initial service status |

These are called during preload initialization and require synchronous responses. They cannot simply become `invoke()` because the preload runs before the page is ready.

---

## Implementation Plan

### Step 1: Extend `DesktopRuntime` Interface

**Goal:** Define the full runtime contract covering all Electron APIs used in `main.ts`.

```typescript
interface DesktopRuntime {
  // Existing
  scopedIPC: RuntimeScopedIPC
  native: any  // Escape hatch

  // New: Application lifecycle
  app: {
    setName(name: string): void
    setAppUserModelId(id: string): void
    whenReady(): Promise<void>
    onActivate(callback: () => void): void
    onBeforeQuit(callback: () => void): void
    exit(code?: number): void
    appendSwitch(key: string, value?: string): void
  }

  // New: Window management
  window: {
    create(options: RuntimeWindowOptions): Promise<RuntimeWindow>
    restore(id: string): Promise<RuntimeWindow | null>
  }

  // New: Protocol handling
  protocol: {
    handle(scheme: string, handler: (request: Request) => Promise<Response>): void
    fetch(url: string, options?: RequestInit): Promise<Response>
  }

  // New: Shell
  shell: {
    openExternal(url: string): Promise<void>
  }

  // New: Plugin context factory
  createPluginContext(window: RuntimeWindow, pluginId: string): RuntimePluginContext
}
```

**Files:** `packages/core/assets/electron/types.ts` (or inline in runtime module)

### Step 2: Route Application Lifecycle Through Runtime

**Goal:** Replace direct `app.*` calls with `runtime.app.*`.

1. Implement `app` namespace in `createElectronRuntime()`
2. Update `main.ts` to use `runtime.app.setName()`, `runtime.app.whenReady()`, etc.
3. `appendSwitch` is testing-only — route through runtime but mark as optional

**Files:** `main.ts`, `packages/core/assets/electron/electron.ts`

### Step 3: Delegate `createWindow` Through Runtime

**Goal:** Move the ~150-line `createWindow` function behind `runtime.window.create()`.

1. Extract window creation logic from `main.ts` into the Electron runtime adapter
2. `runtime.window.create()` returns a `RuntimeWindow` (wraps `BrowserWindow`)
3. `RuntimeWindow` exposes: `loadURL()`, `show()`, `close()`, `on()`, `webContents` (as an opaque event emitter)
4. Plugins receive `RuntimeWindow` instead of raw `BrowserWindow`

**Tricky parts:**
- Window creation involves Electron-specific options (`webPreferences`, `preload` path)
- The current function has inline IPC setup and security configuration
- Must preserve the plugin `createWindow` callback interface

**Files:** `main.ts`, `packages/core/assets/electron/electron.ts`, `modules/window.ts`

### Step 4: Route Protocol Handling Through Runtime

**Goal:** Replace direct `electron.protocol.handle()` and `electron.net.fetch()` with `runtime.protocol.*`.

1. Implement `protocol` namespace in Electron runtime adapter
2. The protocol handler logic stays in `modules/protocol.ts` but is invoked through the runtime
3. Enable future plugin sub-route registration via `runtime.protocol.handle('commoners://plugins/<name>/*', handler)`

**Files:** `main.ts`, `packages/core/assets/electron/electron.ts`, `modules/protocol.ts`

### Step 5: Wrap Plugin Context with RuntimePluginContext

**Goal:** Plugin `desktop.load` hooks receive a runtime-agnostic context instead of raw Electron objects.

1. `RuntimePluginContext` wraps `BrowserWindow` methods into a portable API
2. Plugins that need the raw `BrowserWindow` can access `context.native` (escape hatch)
3. Update `modules/plugins.ts` to create `RuntimePluginContext` via `runtime.createPluginContext()`

**Current plugin context API (from `modules/plugins.ts`):**
- `electron`, `utils` — raw Electron references
- `createWindow`, `send`, `on`, `invoke`

**New `RuntimePluginContext`:**
- `createWindow` — delegates to `runtime.window.create()`
- `send`, `on`, `invoke` — delegates to `runtime.scopedIPC.plugin*`
- `native` — escape hatch for Electron-specific access

**Files:** `modules/plugins.ts`, `packages/core/assets/electron/electron.ts`

### Step 6: Evaluate Preload `sendSync` Elimination

**Goal:** Determine if the 3 synchronous IPC calls can be replaced with an alternative pattern.

**Options:**
1. **Async preload with deferred rendering** — Preload fetches data via `invoke()`, stores in global, renderer waits for `DOMContentLoaded` + data-ready signal
2. **Embedded data in HTML** — Inject service metadata and location into the HTML at build/serve time via the Vite plugin (already done partially with `commoners` global)
3. **Keep `sendSync` behind the runtime abstraction** — The runtime adapter provides `syncFetch()` that Electron implements with `sendSync` and Tauri implements differently (e.g., reading from a Rust-provided global)

**Recommendation:** Option 3 is most pragmatic. The synchronous requirement is real (preload must have data before page load). Abstract it rather than eliminate it.

**Files:** `preload.ts`, `packages/core/assets/electron/electron.ts`

### Step 7: Plugin Protocol Sub-Route Registration

**Goal:** Allow plugins to register handlers for `commoners://plugins/<name>/*` routes.

1. Add `runtime.protocol.registerPluginRoute(pluginName, handler)` to the interface
2. During plugin `desktop.load`, plugins can register sub-routes
3. The main protocol handler delegates to registered plugin handlers
4. Deferred from Custom Protocol work — now has a clear home in the runtime

**Files:** `modules/protocol.ts`, `modules/plugins.ts`, runtime interface

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `packages/core/assets/electron/main.ts` | Modify | Replace ~18 direct API calls with runtime methods |
| `packages/core/assets/electron/electron.ts` | Modify | Extend `createElectronRuntime()` with new namespaces |
| `packages/core/assets/electron/preload.ts` | Modify | Abstract `sendSync` behind runtime |
| `packages/core/assets/electron/modules/plugins.ts` | Modify | Create `RuntimePluginContext` via runtime |
| `packages/core/assets/electron/modules/protocol.ts` | Modify | Route through `runtime.protocol`, add sub-routes |
| `packages/core/assets/electron/modules/window.ts` | Modify | Integrate with `runtime.window.create()` |
| Runtime types (new or extended) | Create/Modify | Full `DesktopRuntime` interface definition |

---

## Dependencies

- No external dependencies
- Phase 1 work already started (runtime exists, service IPC routed)
- Blocks: [Tauri Desktop Backend](./tauri-desktop-backend.md) (Phase 2)

---

## Verification

- [ ] Zero direct `app.*` calls remain in `main.ts` (all go through `runtime.app.*`)
- [ ] `createWindow` delegates to `runtime.window.create()`
- [ ] Protocol handling routes through `runtime.protocol.*`
- [ ] Plugin `desktop.load` receives `RuntimePluginContext` (not raw `BrowserWindow`)
- [ ] Plugin protocol sub-routes are registerable via `runtime.protocol.registerPluginRoute()`
- [ ] Preload synchronous data fetching is abstracted behind the runtime
- [ ] All existing desktop tests still pass (no behavioral regressions)
- [ ] `runtime.native` escape hatch provides raw Electron access where needed

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Over-abstraction makes debugging harder | `runtime.native` escape hatch; logging at runtime boundary |
| Breaking existing plugins that use raw `BrowserWindow` | `context.native` preserves access; deprecation warning first |
| Preload `sendSync` abstraction is leaky | Accept that sync init data is a runtime concern; each adapter handles it differently |
| Large changeset risks regressions | Incremental steps; run desktop test suite after each step |
| `createWindow` extraction is complex (inline IPC, security) | Extract in stages; keep security setup co-located with window creation |

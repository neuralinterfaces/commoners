# Commoners Roadmap

## Dependency History

### Electron Beta Pin (resolved)
Electron was pinned to `39.0.0-beta.1` (from `^38.1.0`) in commit `f16ee5d` to work around a bug in the stable Electron 38 release that affected service environment handling. This has been resolved by upgrading to stable Electron `^40.8.0`. If similar issues resurface, pin to a specific stable version rather than a beta.

### electron-builder Pin (resolved)
`electron-builder` was pinned to `24.13.3` due to breaking changes in the 25.x series around code signing and ASAR handling. Upgraded to `^26.8.1` — the signing and ASAR APIs have stabilized.

## Deferred Items

Items deferred from recent work, tracked in detailed implementation plans under [`docs/roadmap/`](./docs/roadmap/features.md).

| Deferred Item | Origin | Tracked In |
|--------------|--------|-----------|
| Plugin protocol sub-route registration | Custom Protocol | [Runtime Abstraction Completion](./docs/roadmap/runtime-abstraction-completion.md) |
| Full E2E protocol tests (build+launch Electron) | Custom Protocol | [Testing and Distribution](./docs/roadmap/testing-and-distribution.md) |
| E2E WASM compilation test (requires Rust toolchain) | WASM Service Compilation | [Testing and Distribution](./docs/roadmap/testing-and-distribution.md) |
| C++ WASM via Emscripten | WASM Service Compilation | [Device Communication Abstraction](./docs/roadmap/device-communication-abstraction.md) |
| Mobile build output tests (5 areas) | Mobile Workflow Validation | [Testing and Distribution](./docs/roadmap/testing-and-distribution.md) |
| ~~22 direct Electron API calls not routed through runtime~~ | Tauri Investigation Phase 1 | [Runtime Abstraction Completion](./docs/roadmap/runtime-abstraction-completion.md) (done) |
| Preload `sendSync` elimination | Tauri Investigation Phase 1 | [Runtime Abstraction Completion](./docs/roadmap/runtime-abstraction-completion.md) |
| Security threat model and controls | — | [Security Whitepaper](./docs/roadmap/security-whitepaper.md) |
| SEA cross-compilation (universal binaries) | Tauri SEA Integration | [Tauri Future Work](./docs/roadmap/tauri-future-work.md) |
| Tauri dev mode testing | Tauri Testing | [Tauri Future Work](./docs/roadmap/tauri-future-work.md) |
| ~~Typed Command Registry~~ | Tauri Deep Integration Audit | [Tauri Future Work](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements) (done) |
| ~~Capabilities-Driven IPC Allowlist~~ | Tauri Deep Integration Audit | [Tauri Future Work](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements) (done) |
| Plugin Hot Reload (dev mode) | Tauri Deep Integration Audit | [Tauri Future Work](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements) |
| Service Health Monitoring | Tauri Deep Integration Audit | [Tauri Future Work](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements) |
| Unified Async Runtime API | Tauri Deep Integration Audit | [Tauri Future Work](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements) |

## Upcoming

### Vite 8 / Rolldown Preparation — Architecture
- Vite 8 will ship with Rolldown as the default bundler, replacing Rollup and esbuild for both dev and production
- Audit all Rollup-specific plugin hooks and options used in `packages/core/vite/` for Rolldown compatibility
- Review esbuild usage in `packages/core/` — direct esbuild calls for service bundling may remain unaffected, but Vite's internal esbuild usage will change
- Minimize reliance on Rollup-only plugin APIs; prefer Vite's abstraction layer
- Track the [Vite 8 RFC / release notes](https://github.com/vitejs/vite) for migration guidance
- Goal: stay stable on Vite 7 now, but keep the build system lithe enough for a smooth Vite 8 migration

## Low Lift

### ~~Fix `import.meta.url` on Windows~~ — Desktop (done)
- Shared `toFilePath` / `getFilename` utility in `packages/core/utils/paths.ts`; applied in `globals.ts` and `electron/main.ts`

### ~~Scope Device Modal Styles~~ — Plugins (done)
- CSS custom properties with `prefers-color-scheme` dark mode and `data-theme` attribute override in `packages/plugins/devices/modal.ts`

### ~~Split Tests into Individually Runnable Units~~ — Testing (done)
- Tests split into `config.test.ts`, `start.test.ts`, `build.test.ts`, `desktop.test.ts`, `services.test.ts`
- Targeted scripts: `pnpm test:config`, `pnpm test:start`, `pnpm test:build`, `pnpm test:desktop`, `pnpm test:services`

### ~~Expand `.env` / Service Ignoring Tests~~ — Testing (done)
- 32 tests across `tests/env.test.ts` and `tests/service-env.test.ts` covering: file loading, mode-specific overrides, priority order, un-prefixed variable access, security model
- `.env` files are copied to desktop build output via `getAppAssets()` with `force: true`
- Targeted script: `pnpm test:env`

### ~~Rust `CargoService` Helper~~ — Services (done)
- `CargoService` helper implemented in `packages/core/assets/services/cargo.ts`
- Auto-detects `.rs` source files, resolves Cargo project root, handles cross-platform binary naming

### ~~Starter Kit Overhaul~~ — Release (done)
- `create-commoners` rebuilt from scratch with proper source code and Vite build
- Template includes: TypeScript HTTP service, splash screen plugin, multi-page navigation, env vars, mobile-ready Capacitor deps
- Scaffolds via `npm create commoners` / `pnpm create commoners`

### ~~Homepage & Why Page Messaging~~ — Documentation (done)
- Rewrote homepage hero tagline and feature cards to lead with multi-language service orchestration
- Restructured `docs/why.md` around the core differentiator (backend services across platforms)
- Added competitor comparison table (Commoners vs Tauri vs Capacitor vs Quasar vs Expo)
- Reframed Neural Interfaces origin story as proof rather than limitation
- Updated site description in VitePress config

### ~~`commoners share` CLI Command~~ — CLI (done)
- New `commoners share` command starts services and advertises them on the local network via Bonjour/mDNS
- `packages/core/share.ts`: `shareServices()` resolves config, builds services in dev mode, creates active services, publishes via `bonjour-service` (dynamic import)
- CLI options: `--service <name>` to share specific services, `--port <port>` to override port (single service only)
- Prints service URLs with local IP; clean shutdown on Ctrl+C (unpublish + close)
- `bonjour-service` added as optional dependency to core package
- Documented in `docs/reference/cli.md`

## Low–Medium Lift

### ~~E2E Electron Auto-Close~~ — Testing (done)
- ~~Ensure E2E tests complete; Electron should close down automatically~~ (resolved by Electron 40 upgrade)
- E2E tests expanded: PAGES navigation, service lifecycle (desktop), desktop metadata (`TARGET`, `ROOT`)

### ~~Fix GHA Build Tests~~ — Testing (done)
- CI restructured with lint/typecheck as non-blocking; core build tests passing
- `ci.yml` split into `test-fast` (config + env) and `test-services` (Rust + compilation) jobs across OS/Node matrix
- `testing.yml` triggers on `dev` branch; uses split test scripts for per-category failure isolation

### ~~Headless Mobile Testing~~ — Testing (done)
- Mobile `start` and `build` tests now run via Vite preview server (no Xcode/Android Studio required)
- `start.ts` serves built web assets in testing mode instead of calling `mobile.open()`
- `MobileLaunchStrategy` serves web assets via `vite.preview()` in headless/testing/CI mode
- Tests exercise `commoners.MOBILE`, pages, plugins, services, and env variables
- Activated by `__COMMONERS_TESTING`, `CI=true`, or `COMMONERS_HEADLESS=true`

### ~~Validate Mobile Workflows~~ — Mobile (done)
- Headless mobile testing via Vite preview server (see above)
- Mobile workflow validation tests in `tests/mobile-workflow.test.ts`: Capacitor config generation, permission injection validation, dependency detection, build-to-assets verification
- Serial plugin: Android USB serial support via Capacitor (`UsbSerial` manifest with `android.hardware.usb.host` feature and `USB_PERMISSION`)
- iOS serial **not supported** due to Apple MFi program restrictions — documented in plugin source
- Targeted script: `pnpm test:mobile-workflow`

### ~~Fix Pre-existing Test Failures~~ — Testing (done)
- Windows plugin `load` method: added `async` keyword (was using `await` in non-async function)
- Mobile `checkAssets`: default `baseDir` now appends `/mobile` for mobile targets, matching `MobileBuildStrategy.getTempDir()`
- Service echo tests: replaced single 500ms sleep with `waitForService()` retry utility (250ms→3s backoff, 30s timeout) — handles slow-compiled services (C++, Rust) and unavailable services (numpy without conda) gracefully

## Medium Lift

### ~~Extensions Unification~~ — Architecture (done)
- Plugins and services unified under a canonical `extensions` record on `ResolvedConfig`
- Each extension auto-classified as `'plugin'`, `'service'`, or `'hybrid'` via `classifyExtensions()`
- New types: `Extension`, `ResolvedExtension`, `ResolvedExtensions`, `ExtensionCapabilities`
- `config.plugins` and `config.services` remain as legacy accessor views with shared references
- `EXTENSIONS` exposed on the `commoners` global at runtime
- `commoners.query()` filters extensions by capabilities (platform, runtime, provides)
- `queryExtensions()` utility in `packages/core/assets/capabilities.ts`
- Adapter helpers `getPlugins()` / `getServices()` used throughout codebase
- Plugin capabilities added: BLE (`bluetooth`, `ble`, `device-access`), Serial (`serial`, `device-access`)
- Service capabilities added: `PyInstallerService`, `CargoService` set `{ runtime: 'process', platforms: { desktop: true } }`

### ~~Electron IPC Async Migration~~ — Desktop (done)
- Replaced all `ipcRenderer.sendSync()` calls with async `ipcRenderer.invoke()` for Electron 40+ compatibility
- `ipcMain.on` with `ev.returnValue` → `ipcMain.handle` for `commoners:services`, `commoners:location`, service status
- Added `serviceHandle()` to IPC module alongside existing `serviceOn()`
- Removed `sendSync` from the exposed preload API and plugin desktop context
- Windows plugin updated: `this.sendSync()` → `await this.invoke()`, `this.on()` → `this.handle()` for handlers

## Medium Lift

### ~~Custom Protocol~~ — Architecture (done)
- Expose services and pages to custom protocol (foundation exists in `packages/core/assets/electron/modules/protocol.ts`)
- Protocol handler for `commoners://services/*` validates service existence and proxies to service URL
- `commoners://plugins/*` handler serves plugin assets from the build output
- `commoners://pages/*` validates page existence, propagates search/hash params, returns proper `Response` to `protocol.handle()`
- `getPageLocation()` returns `null` for missing files in dev mode (no phantom pages); falls back to ASAR-compatible resolution in production
- **Architecture boundary (decided):** The `commoners` global API (quit, close, PAGES navigation, SERVICES lifecycle, plugin contexts) is the **generic desktop contract**. Electron-specific implementations in `packages/core/assets/electron/` should be treated as a **runtime adapter**.
- Unit tests for protocol utilities (`decodePath`, `normalizeAndCompare`, `isValidUrl`, `isCommonersUrl`, `isCommonersAsset`) in `tests/protocol.test.ts`
- Targeted script: `pnpm test:protocol`
- **Deferred:** Plugin protocol sub-route registration (better suited after Tauri Phase 2 via `RuntimeProtocol`); full E2E protocol tests (require building + launching Electron app)

### ~~Platform Enhancement~~ — Design (done)
- Platform Enhancement guide written in `docs/guide/platform-enhancement.md`
- Covers progressive enhancement, graceful degradation, and platform enhancement concepts
- Documents `isSupported` API for platform-specific plugin gating
- Documents service `publish` patterns for cross-platform availability
- Platform-specific storage patterns with conditional guards remain as future work

### ~~WASM Service Compilation~~ — Architecture (done)
- Compile Rust services to WebAssembly for browser-based execution via `WasmCargoService` (`packages/core/services/wasm.ts`)
- WASM services marked with `__wasm: true` flag; build system skips URL/port assignment and process spawning
- `sanitize()` sets `type: 'wasm'` and resolves `url` to the WASM asset filepath
- Demo Rust WASM service in `examples/demo/src/services/rust-wasm/`
- Exported via `services.wasm.services()` / `services.wasm.service()` helpers
- `commoners:wasm` virtual module provides `loadWasmService()` and `isWasmService()` helpers with module caching
- Service discovery via `commoners.query({ runtime: 'wasm' })` using `queryExtensions()`
- Unit tests for WASM service constructor, build info resolution, sanitization, and extension queries in `tests/wasm.test.ts`
- Documentation updated in `docs/guide/services/rust.md` with helper usage and discovery examples
- Targeted script: `pnpm test:wasm`
- **Deferred:** C++ WASM via Emscripten (separate feature requiring new service class); E2E WASM compilation test (requires Rust toolchain)

### ~~Walkthroughs~~ — Documentation (done)
- OpenAPI walkthrough: `docs/guide/walkthroughs/openapi.md` — Node/Express, Python/FastAPI, and Rust/utoipa examples
- Local services walkthrough: `docs/guide/walkthroughs/local-services.md` — Bonjour/mDNS discovery via `@commoners/local-services`

## Medium–High Lift

### ASAR Utilities — Architecture
- Fix ASAR on Mac after code signing
- Complete ASAR utilities for Windows compatibility
  - Use native tools (e.g. PowerShell scripts) where necessary, spawned from cross-platform manager scripts
- Fix sandbox behavior on Windows
- Note: extensive infrastructure already exists in `packages/core/utils/asar/`; work is mostly debugging and platform edge cases
- Note: upgrading to `electron-builder@26` may have improved ASAR behavior — retest before deep-diving

### Native Emulator Testing — Testing
- Android: [`ReactiveCircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner) + Appium/WebDriverIO
- iOS: `macos-latest` runner + iOS Simulator + XCUITest or Appium
- [`@onslip/automation`](https://github.com/niclas-niclas/niclas-niclas) for WebView testing in native containers
- Create `tests/mobile-native.test.ts` with emulator-based E2E tests
- Cost: ~$0.08/min macOS, 5-15 min/run — use `workflow_dispatch` trigger
- Covers: native Capacitor plugins, native UI, app lifecycle, actual device behavior

### Automated Mobile Distribution — Mobile
- Complete automated mobile distribution pipeline
- Automated mobile build system for [iOS](https://github.com/dulvui/godot-ios-upload) and [Android](https://github.com/dulvui/godot-android-export0) on GitHub Actions

## High Lift

### Tauri Investigation — Desktop (Phase 1 done, Phase 2 done)
- Compare how services are included in Electron vs the sidecar concept in Tauri
- Tauri's sidecar model maps directly to compiled services (Rust, C++) — evaluate whether existing service compilation can target Tauri sidecars with minimal changes
- Evaluate difficulty of providing Tauri analogues for all Electron-specific behaviors
- Swap Tauri for Electron when no Electron-specific plugins are used
- Rust services would be native Tauri sidecars rather than spawned child processes
- **Architecture boundary (decided):** When evaluating Tauri, the existing `packages/core/assets/electron/` modules should be refactored behind a `DesktopRuntime` interface. The 6 Electron modules (config, security, ipc, window, protocol, lifecycle) each map to Tauri equivalents — the interface should abstract per-module rather than as a monolith.
- **Phase 1 complete:** `DesktopRuntime` interface extended with `RuntimeScopedIPC` (scoped IPC helpers for services/plugins), `RuntimePluginContext`, and `ListenerHandle`. `createElectronRuntime()` adapter implements all interfaces. `main.ts` now creates runtime at startup and routes service IPC (`serviceSend`, `serviceOn`) and plugin IPC (`pluginSend`, `pluginOn`, `pluginHandle`) through `runtime.scopedIPC.*`. Plugin context creation accepts optional `DesktopRuntime` parameter. Runtime exposes `native` property for Electron escape hatch.
- **Phase 2 complete:** Tauri desktop backend fully functional — `TauriBuildStrategy`, `TauriLaunchStrategy`, `TauriDevStrategy`, `TauriMobileBuildStrategy`, Vite plugin, frontend runtime adapter. 66 unit tests. SEA compilation for JS services. WebDriver-based testing via `tauri-driver`.
- **Phase 3 complete:** Runtime abstraction completion — all Electron API calls in `main.ts` routed through `DesktopRuntime` (`runtime.window.create()`, `runtime.window.show()`, `runtime.window.loadURL()`, `runtime.window.onNavigate()`, etc.). Plugin context `runtime` parameter made required (no more IPC fallbacks). `IPC.setSendToRenderer()` abstraction added. `TauriWindow` interface expanded with stubs for all new `RuntimeWindow` methods.
- **Remaining:** Preload `sendSync` elimination (3 synchronous IPC calls), complete `createTauriRuntime()` adapter for full runtime parity.

### Tauri-Inspired Deep Integration — Architecture

Cross-cutting improvements inspired by Tauri's design patterns. Benefits all backends (Electron, Tauri, web). Full details in [`docs/roadmap/tauri-future-work.md`](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements).

**High Priority (done):**
- ~~**Typed Command Registry**~~ — `Commands` object in `commands.ts` provides typed channel references, compile-time type safety, and validation. All `main.ts` IPC handlers migrated from string literals to `Commands.*.channel`.
- ~~**Capabilities-Driven IPC Allowlist**~~ — `generateIPCAllowlist()` builds per-extension allowlist from config. Main process validates via `IPC.setIPCAllowlist()`. Preload receives allowlist via `additionalArguments` and validates scoped channels against declared plugin/service IDs. Falls back to prefix-based check for backward compatibility.

**Medium Priority (Plugin Capability Declaration done):**
- ~~**Plugin Capability Declaration**~~ — Capabilities added to Windows, Splash Screen, and Local Services plugins. `validateRequirements()` utility added to `capabilities.ts`. Dev-mode warning for extensions without capabilities.
- **Plugin Hot Reload (dev mode)** — Add `unload()` hook to plugin interface; watch plugin files and trigger reload via IPC
- **Service Health Monitoring** — Heartbeat checks, auto-restart with exponential backoff, `service:health` events
- **Window Event Bus** — Cross-window broadcast events + window state persistence across restarts
- **Unified Async Runtime API** — Replace `READY` promise with `commoners.initialize()`, clarify `desktop` availability, add plugin event system and dev debug API

**Low Priority:**
- **Declarative Service Bundling** — Service manifest for build-time inclusion, binary hash integrity verification

### Vite Plugin Refactor — Architecture
- Investigate refactoring the core build system as a Vite plugin
- Evaluate which behaviors are too complex for the plugin model and need to remain standalone
- Current system is deeply integrated across build orchestration, services, and multi-target compilation
- Consider how this intersects with Vite 8 / Rolldown — a plugin refactor may be best timed alongside the Vite 8 migration

# Commoners Roadmap

## Dependency History

### Electron Beta Pin (resolved)
Electron was pinned to `39.0.0-beta.1` (from `^38.1.0`) in commit `f16ee5d` to work around a bug in the stable Electron 38 release that affected service environment handling. This has been resolved by upgrading to stable Electron `^40.8.0`. If similar issues resurface, pin to a specific stable version rather than a beta.

### electron-builder Pin (resolved)
`electron-builder` was pinned to `24.13.3` due to breaking changes in the 25.x series around code signing and ASAR handling. Upgraded to `^26.8.1` — the signing and ASAR APIs have stabilized.

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

### Custom Protocol — Architecture (in progress)
- Expose services and pages to custom protocol (foundation exists in `packages/core/assets/electron/modules/protocol.ts`)
- Extend custom protocol support to plugins
- Use custom protocol to load `searchQueryParams`
- Only allow existing files for Vite dev mode and published apps (no spontaneous redirects)
- **Architecture boundary (decided):** The `commoners` global API (quit, close, PAGES navigation, SERVICES lifecycle, plugin contexts) is the **generic desktop contract**. Electron-specific implementations in `packages/core/assets/electron/` should be treated as a **runtime adapter**. When adding protocol support, introduce a `DesktopRuntime` interface rather than adding more Electron-specific code to core. Key implication: `sendSync` (Electron-only) should not be part of the public API — use async `invoke` instead.
- **Progress:** Protocol handler for `commoners://services/*` validates service existence; new `commoners://plugins/*` handler serves plugin assets; `commoners://pages/*` propagates search/hash params; `getPageLocation()` returns `null` for missing files with 404 logging

### ~~Platform Enhancement~~ — Design (done)
- Platform Enhancement guide written in `docs/guide/platform-enhancement.md`
- Covers progressive enhancement, graceful degradation, and platform enhancement concepts
- Documents `isSupported` API for platform-specific plugin gating
- Documents service `publish` patterns for cross-platform availability
- Platform-specific storage patterns with conditional guards remain as future work

### WASM Service Compilation — Architecture (in progress)
- Compile Rust (and potentially C++) services to WebAssembly for browser-based execution
- Enables running compiled services in PWA targets without a separate server process
- **Progress:** `WasmCargoService` implemented in `packages/core/services/wasm.ts` wrapping `wasm-pack build`
- WASM services marked with `__wasm: true` flag; build system skips URL/port assignment and process spawning
- `sanitize()` sets `type: 'wasm'` and resolves `url` to the WASM asset filepath
- Demo Rust WASM service in `examples/demo/src/services/rust-wasm/`
- Exported via `services.wasm.services()` / `services.wasm.service()` helpers
- Remaining: browser-side WASM instantiation, integration with capabilities query, C++ support

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

### Tauri Investigation — Desktop
- Compare how services are included in Electron vs the sidecar concept in Tauri
- Tauri's sidecar model maps directly to compiled services (Rust, C++) — evaluate whether existing service compilation can target Tauri sidecars with minimal changes
- Evaluate difficulty of providing Tauri analogues for all Electron-specific behaviors
- Swap Tauri for Electron when no Electron-specific plugins are used
- Rust services would be native Tauri sidecars rather than spawned child processes
- No existing implementation; requires research, design, and significant new code
- **Architecture boundary (decided):** When evaluating Tauri, the existing `packages/core/assets/electron/` modules should be refactored behind a `DesktopRuntime` interface. The 6 Electron modules (config, security, ipc, window, protocol, lifecycle) each map to Tauri equivalents — the interface should abstract per-module rather than as a monolith.
- **Progress:** `DesktopRuntime` interface defined in `packages/core/assets/runtime/types.ts` with sub-interfaces (`RuntimeIPC`, `RuntimeProtocol`, `RuntimeWindow`, `RuntimeLifecycle`). `createElectronRuntime()` adapter in `packages/core/assets/runtime/electron.ts` wraps existing Electron modules. Not yet fully integrated — preparatory work for runtime swappability.

### Vite Plugin Refactor — Architecture
- Investigate refactoring the core build system as a Vite plugin
- Evaluate which behaviors are too complex for the plugin model and need to remain standalone
- Current system is deeply integrated across build orchestration, services, and multi-target compilation
- Consider how this intersects with Vite 8 / Rolldown — a plugin refactor may be best timed alongside the Vite 8 migration

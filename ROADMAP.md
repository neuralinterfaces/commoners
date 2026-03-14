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
| Plugin protocol sub-route registration | Custom Protocol | [Tauri Desktop Backend](./docs/roadmap/tauri-desktop-backend.md) |
| Full E2E protocol tests (build+launch Electron) | Custom Protocol | [Testing and Distribution](./docs/roadmap/testing-and-distribution.md) |
| E2E WASM compilation test (requires Rust toolchain) | WASM Service Compilation | [Testing and Distribution](./docs/roadmap/testing-and-distribution.md) |
| C++ WASM via Emscripten | WASM Service Compilation | [Device Communication Abstraction](./docs/roadmap/device-communication-abstraction.md) |
| Mobile build output tests (5 areas) | Mobile Workflow Validation | [Testing and Distribution](./docs/roadmap/testing-and-distribution.md) |
| Security threat model and controls | — | [Security Whitepaper](./docs/roadmap/security-whitepaper.md) |
| SEA cross-compilation (universal binaries) | Tauri SEA Integration | [Tauri Future Work](./docs/roadmap/tauri-future-work.md) |
| Tauri dev mode testing | Tauri Testing | [Tauri Future Work](./docs/roadmap/tauri-future-work.md) |

## Upcoming

### Vite 8 / Rolldown Preparation — Architecture
- Vite 8 will ship with Rolldown as the default bundler, replacing Rollup and esbuild for both dev and production
- Audit all Rollup-specific plugin hooks and options used in `packages/core/vite/` for Rolldown compatibility
- Review esbuild usage in `packages/core/` — direct esbuild calls for service bundling may remain unaffected, but Vite's internal esbuild usage will change
- Minimize reliance on Rollup-only plugin APIs; prefer Vite's abstraction layer
- Track the [Vite 8 RFC / release notes](https://github.com/vitejs/vite) for migration guidance
- Goal: stay stable on Vite 7 now, but keep the build system lithe enough for a smooth Vite 8 migration

<details>
<summary><strong>Completed Items</strong> (27 items)</summary>

| Item | Category | Scope |
|------|----------|-------|
| Fix `import.meta.url` on Windows | Desktop | Low |
| Scope Device Modal Styles | Plugins | Low |
| Split Tests into Individually Runnable Units | Testing | Low |
| Expand `.env` / Service Ignoring Tests | Testing | Low |
| Rust `CargoService` Helper | Services | Low |
| Starter Kit Overhaul | Release | Low |
| Homepage & Why Page Messaging | Documentation | Low |
| `commoners share` CLI Command | CLI | Low |
| E2E Electron Auto-Close | Testing | Low-Medium |
| Fix GHA Build Tests | Testing | Low-Medium |
| Headless Mobile Testing | Testing | Low-Medium |
| Validate Mobile Workflows | Mobile | Low-Medium |
| Fix Pre-existing Test Failures | Testing | Low-Medium |
| Extensions Unification | Architecture | Medium |
| Electron IPC Async Migration | Desktop | Medium |
| Custom Protocol | Architecture | Medium |
| Platform Enhancement | Design | Medium |
| WASM Service Compilation | Architecture | Medium |
| Walkthroughs | Documentation | Medium |
| Plugin Hot Reload (dev mode) | Architecture | Medium |
| Service Health Monitoring | Architecture | Medium |
| Window Event Bus | Architecture | Medium |
| Unified Async Runtime API | Architecture | Medium |
| Declarative Service Bundling | Architecture | Low |
| Preload sendSync Elimination | Desktop | Medium |
| Tauri Runtime Parity | Desktop | Medium |
| macOS ASAR Post-Sign Verification | Architecture | Medium |

</details>

## Medium–High Lift

### ASAR Utilities — Architecture
- ~~Fix ASAR on Mac after code signing~~ — `afterSignVerifyAsarIntegrity()` re-embeds hash if signing modifies the ASAR
- Complete ASAR utilities for Windows compatibility
  - Use native tools (e.g. PowerShell scripts) where necessary, spawned from cross-platform manager scripts
- Fix sandbox behavior on Windows
- Note: extensive infrastructure already exists in `packages/core/utils/asar/`; Windows work is next priority

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

### Tauri Investigation — Desktop (Phases 1–3 done)
- `DesktopRuntime` interface abstracts Electron's 6 modules (config, security, ipc, window, protocol, lifecycle). `createElectronRuntime()` adapter complete. Tauri backend functional with build/launch/dev/mobile strategies + 66 unit tests.
- Preload `sendSync` elimination complete — all 3 synchronous IPC calls replaced with `additionalArguments` injection.
- `createTauriRuntime()` adapter at full parity — enhanced `TauriWindow`, `TauriDialog` with real Tauri v2 APIs; remaining stubs are N/A by design (Tauri's main process is Rust).
- **Remaining:** Device communication abstraction (Batch B next step).

### Tauri-Inspired Deep Integration — Architecture

All 8 items complete (typed commands, IPC allowlist, plugin capabilities, hot reload, health monitoring, event bus, async API, declarative service bundling). See [`docs/roadmap/tauri-future-work.md`](./docs/roadmap/tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements).

### Vite Plugin Refactor — Architecture
- Investigate refactoring the core build system as a Vite plugin
- Evaluate which behaviors are too complex for the plugin model and need to remain standalone
- Current system is deeply integrated across build orchestration, services, and multi-target compilation
- Consider how this intersects with Vite 8 / Rolldown — a plugin refactor may be best timed alongside the Vite 8 migration

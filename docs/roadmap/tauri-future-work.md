# Tauri Desktop Backend — Future Work

This document tracks items that were explicitly out of scope for the initial Tauri implementation and are planned for future releases.

## Current Status (v1.0.0-alpha)

The initial Tauri backend implementation provides:
- `--target tauri` for build, start, and launch commands
- Auto-generated `src-tauri/` project (Cargo.toml, main.rs, tauri.conf.json, capabilities)
- Service binaries as Tauri sidecars via `externalBin`
- Tauri Vite plugin for dev mode with hot-reloading
- Frontend runtime adapter (`createTauriRuntime()`)
- `TauriOptions` config type (`config.tauri`)
- 44 unit tests covering target resolution, config generation, and template correctness

## Future Work

### 1. ~~Tauri Mobile Targets~~ (DONE)

Basic Tauri mobile support implemented via `--target ios-tauri` and `--target android-tauri`:
- `TauriMobileBuildStrategy` and `TauriMobileLaunchStrategy` created
- Target naming standardized: `<platform>-<backend>` (e.g., `ios-capacitor`, `ios-tauri`)
- Capacitor remains the default mobile backend (`ios` → `ios-capacitor`)
- Tauri mobile generates `src-tauri/` with `lib.rs` mobile entry point

Remaining work:
- E2E testing with actual Tauri mobile toolchain
- Service sidecar support on mobile (currently no `externalBin` on mobile builds)

### 2. ~~SEA (Single Executable Application) for JS Services~~ (DONE)

SEA compilation integrated into `TauriBuildStrategy.build()`:
- JS service filepaths (`.js`, `.cjs`, `.mjs`) auto-detected via `extname()`
- `createSEA()` from `utils/sea.ts` compiles JS → esbuild bundle → SEA blob → inject into Node binary
- `isSEASupported()` check in `prepare()` fails fast if Node.js < 20
- `TauriMobileBuildStrategy` logs warning when JS services are skipped (no sidecar on mobile)
- 5 unit tests added to `tests/tauri.test.ts`

Remaining:
- Cross-compilation of SEA binaries (macOS universal, Windows x64, Linux arm64)
- Universal binaries on macOS

### 3. Tauri Preload / IPC Bridge

**Priority:** Medium
**Complexity:** Medium

Tauri v2 doesn't have an Electron-style preload script. The current implementation relies on HTTP for service communication. Future improvements:

- Implement Tauri commands (Rust-side handlers) for direct IPC between frontend and services
- Add a `commoners:invoke` command that routes through Tauri's `invoke()` API
- Support service status monitoring via Tauri events (not polling)

### 4. `--target desktop` Auto-selecting Tauri

**Priority:** Low
**Complexity:** Low

Currently `--target desktop` always resolves to Electron. Future work:

- Add a config option `desktop.default: 'tauri' | 'electron'` to control the default
- Or detect based on which dependencies are installed (prefer Tauri if `@tauri-apps/cli` is present)
- Consider user preference stored in project-level config

### 5. Windowless / Background Mode

**Priority:** Low
**Complexity:** Low

Tauri naturally supports windowless mode via `"app": { "windows": [] }` in `tauri.conf.json`. Future work:

- Add explicit `windowless: true` config option to `TauriOptions`
- Support background-only service orchestration without a GUI window

### 6. Enhanced Code Signing

**Priority:** Medium
**Complexity:** Medium

The current implementation uses basic `codesign -f -s -` for sidecar pre-signing on macOS. Future work:

- Integrate with Tauri's built-in code signing for production builds
- Support Windows code signing via Tauri's NSIS configuration
- Add notarization support for macOS distribution
- Mirror the Electron strategy's certificate validation and error messages

### 7. Custom Tauri Commands

**Priority:** Medium
**Complexity:** Medium

The generated `main.rs` is minimal. Future work:

- Allow users to provide custom Rust code via `config.tauri.commands`
- Auto-generate Tauri command handlers for service proxying
- Support custom Tauri plugins in the generated project

### 8. ASAR Equivalent / Bundle Integrity

**Priority:** Medium
**Complexity:** High

Electron uses ASAR for packaging with integrity checks. Tauri doesn't have an equivalent. Future work:

- Implement service binary hash verification for Tauri builds
- Add integrity manifests to the Tauri bundle
- Mirror the Electron strategy's `generateServiceHashManifest()` for Tauri

### 9. ~~Tauri Testing (WebDriver)~~ (DONE)

WebDriver-based testing adapter implemented in `@commoners/testing`:
- `packages/testing/src/tauri.ts`: `connectTauri()` spawns `tauri-driver`, connects via `webdriverio`
- `createPageProxy()` wraps WebDriverIO browser as Playwright-compatible Page interface (`evaluate`, `url`, `goto`, `waitForFunction`)
- `waitForPort()` TCP poll utility for driver startup detection
- Tauri branch in `open()` function: detects `isTauri(target)`, finds executable via `findTauriExecutable()`, connects via WebDriver
- Cleanup handles tauri-driver process kill + WebDriverIO session deletion
- `webdriverio` as optional dependency; `./tauri` export added to package.json
- 13 unit tests in `tests/tauri-testing.test.ts`

Remaining:
- Dev mode testing (tauri-driver requires built app)
- Full Playwright API compatibility (selectors, screenshots, network interception)
- Windows CDP fallback via WebView2 DevTools Protocol

### 10. Tauri Plugin Ecosystem Integration

**Priority:** Low
**Complexity:** Medium

Tauri v2 has a growing plugin ecosystem. Future work:

- Map commoners plugins to Tauri plugins where applicable (e.g., splash screen)
- Auto-generate Tauri plugin registrations in `main.rs` based on commoners config
- Support `@commoners/splash-screen` via `tauri-plugin-splash-screen`

### 11. Cross-Compilation

**Priority:** Low
**Complexity:** High

The current implementation only builds for the host platform. Future work:

- Support cross-compilation via Tauri's `--target` flag
- Add CI/CD templates for building Tauri apps on multiple platforms
- Support universal binaries on macOS (x86_64 + aarch64)

### 12. Circular Dependency in Test Imports

**Priority:** Low
**Complexity:** Low

Strategy classes (both Build and Launch) cannot be directly imported in vitest tests due to a pre-existing circular dependency: `BuildFlow/LaunchFlow → index.ts → launch.ts → flows/index.ts → strategies → BuildFlow/LaunchFlow`. This affects all strategies, not just Tauri.

- Refactor `BuildFlow.ts` and `LaunchFlow.ts` to lazy-import `resolveConfig` / `resolveHooks`
- Or extract flow orchestration from `index.ts` to break the cycle
- This would enable direct strategy unit tests for all platforms

---

## Deep Integration: Tauri-Inspired Architecture Improvements

These items go beyond Tauri interop — they adopt Tauri's design patterns to improve the framework architecture for all backends (Electron, Tauri, and web). The prerequisite runtime abstraction work is complete (Phase 1–3).

### ~~13. Typed Command Registry~~ (DONE)

**Benefits all backends**

Implemented in `packages/core/assets/electron/modules/commands.ts`:
- `Commands` object with typed entries for all framework IPC channels (`quit`, `close`, `services`, `location`, `pluginsLoaded`, `rendererReady`, `mainReadyPing`, `mainReadyPong`)
- `ConsoleCommands` for log/warn/error redirection channels
- `ScopedCommands.service(id, attr)` and `ScopedCommands.plugin(id, channel)` builders
- Helper functions: `getCommandByChannel()`, `isFrameworkChannel()`, `validateCommand()`
- `FRAMEWORK_CHANNELS` constant with all registered channel strings
- All `main.ts` IPC handlers migrated from string literals to `Commands.*.channel`

### ~~14. Capabilities-Driven IPC Allowlist~~ (DONE)

**Benefits all backends**

Implemented in `packages/core/assets/electron/modules/ipc-allowlist.ts`:
- `generateIPCAllowlist(pluginIds, serviceIds)` builds per-extension allowlist from config
- Main process validates via `IPC.setIPCAllowlist()` — scoped channels checked against declared IDs
- Preload receives allowlist via `additionalArguments` and validates scoped channels against declared plugin/service IDs
- Falls back to prefix-based check for backward compatibility (no allowlist data = legacy behavior)
- `serializeAllowlist()` / `deserializeAllowlist()` for transfer between processes

### ~~15. Plugin Capability Declaration~~ (DONE)

**Benefits all backends**

Implemented across 3 official plugins + core utilities:
- Windows plugin: `{ provides: ['windows', 'multi-window'], platforms: { web: true, desktop: true } }`
- Splash Screen plugin: `{ provides: ['splash-screen', 'loading-screen'], platforms: { desktop: true } }`
- Local Services plugin: `{ provides: ['local-services', 'service-discovery', 'mdns'], platforms: { desktop: true } }`
- `validateRequirements()` utility in `packages/core/assets/capabilities.ts` checks `requires` against all `provides`
- Dev-mode diagnostic warning for extensions without capabilities (suppressed during tests)
- Pairs with existing `queryExtensions()` and `commoners.query()` infrastructure

### 16. Plugin Hot Reload (Dev Mode)

**Priority:** Medium
**Complexity:** Medium
**Benefits all backends**

Plugins load once at startup with no reload mechanism. Add dev-mode hot reload:

- Add optional `unload()` hook to plugin interface for teardown
- Watch plugin files in dev mode; trigger reload via IPC
- Re-run `load` hook with fresh module after teardown
- Only applies to dev mode — production plugins remain static

### 17. Service Health Monitoring

**Priority:** Medium
**Complexity:** Medium
**Benefits all backends**

Service status is binary (running/closed). Add health monitoring:

- Heartbeat checks via HTTP or IPC
- Auto-restart with exponential backoff
- `service:health` events for CLI/testing integration
- `ServiceHealth` type: `{ status, uptime, lastHeartbeat, restartCount }`
- Especially valuable for Tauri sidecars where the parent process can't `fork()` to check

### 18. Window Event Bus

**Priority:** Medium
**Complexity:** Low
**Benefits Electron and Tauri**

Windows communicate via scoped IPC channels with no cross-window broadcast mechanism:

- Central event bus in main process for cross-window events
- `commoners.windows.broadcast(event)` API
- Window state persistence across app restarts (position, size, maximized)
- Mirrors Tauri's multi-webview event system

### 19. Unified Async Runtime API

**Priority:** Medium
**Complexity:** Medium
**Benefits all backends**

The `commoners` global mixes sync properties (`DESKTOP` as boolean vs object) with async patterns (`READY` promise). Tauri is async-first:

- Replace `READY` promise with explicit `commoners.initialize()` API
- `commoners.desktop` always an object with `isAvailable` property (not boolean/object union)
- Plugin event system: `commoners.plugins.emit()` / `commoners.plugins.on()` for plugin-to-plugin communication
- Dev-mode debug API: `commoners.debug.getPluginState()`, `commoners.debug.getServiceState()`

### 20. Declarative Service Bundling

**Priority:** Low
**Complexity:** Low
**Benefits Tauri primarily**

Services are resolved at runtime in Node.js, not declared in config upfront:

- Add service metadata to resolved config for build strategies
- Enables Tauri's bundler to auto-include services without post-build copying
- Service manifest with binary hashes for integrity verification at launch
- Mirrors Tauri's `externalBin` declarative model

### Priority Summary

| # | Item | Priority | Effort | Benefits |
|---|------|----------|--------|----------|
| ~~13~~ | ~~Typed Command Registry~~ | ~~High~~ | Done | All backends |
| ~~14~~ | ~~Capabilities-Driven IPC~~ | ~~High~~ | Done | All backends |
| ~~15~~ | ~~Plugin Capability Declaration~~ | ~~Medium~~ | Done | All backends |
| 16 | Plugin Hot Reload | Medium | Medium | All backends |
| 17 | Service Health Monitoring | Medium | Medium | All backends |
| 18 | Window Event Bus | Medium | Low | Desktop |
| 19 | Unified Async API | Medium | Medium | All backends |
| 20 | Declarative Service Bundling | Low | Low | Tauri |

---

## Dependencies

Users must install to use Tauri:
- **Rust toolchain** (`rustc`, `cargo`) — https://rustup.rs/
- **`@tauri-apps/cli`** — `npm install -D @tauri-apps/cli`
- **Platform prerequisites** — see https://v2.tauri.app/start/prerequisites/

---

## Build Overhead & Bloat Reduction

### Current Overhead (Web Target, Blank App)

| Metric | Raw Vite | Commoners | Overhead |
|--------|----------|-----------|----------|
| Build time | ~210ms | ~330ms | +120ms |
| Output size | 4.0K (1 file) | 32K (5 files) | +28K |

Breakdown of the 28K overhead:
- `icon-*.png` (12K) — default app icon (ships even if unused)
- `onload-*.mjs` (7.1K) — plugin runtime loader
- `commoners.config-*.mjs` (550B) — browser config bundle
- `commoners.config.cjs` (527B) — Electron config bundle (shipped even for web)
- `index.html` grows by ~2.9K (inline bootstrap script)

### Bloat Reduction Opportunities

1. **Tree-shake unused assets** — skip `commoners.config.cjs` for non-Electron targets, skip icon if not configured
2. **Lazy-load onload.mjs** — defer plugin loading to reduce critical path (~7K savings)
3. **Minify inline bootstrap script** — the 2.9K inline script in `index.html` could be minified
4. **Conditional icon bundling** — only include default icon if no custom icon configured

### Multi-Target Benchmarks

`examples/bench/benchmark.sh` measures web build overhead (Commoners vs raw Vite). Extend to cover additional targets:
- **Electron** — binary size, node_modules contribution, startup time
- **Tauri** — binary size comparison vs Electron
- **PWA** — service worker overhead, manifest size
- **Mobile (Capacitor)** — web assets size injected into native project
- **Mobile (Tauri)** — compare with Capacitor mobile overhead

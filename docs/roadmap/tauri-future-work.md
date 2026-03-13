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

### 2. SEA (Single Executable Application) for JS Services

**Priority:** High
**Complexity:** High

Tauri has no `fork()` equivalent — JS services must run as standalone executables. The current implementation expects pre-compiled service binaries. Future work:

- Implement Node.js SEA compilation pipeline for JS/TS services
- Auto-compile JS services to SEA binaries during `commoners build --target tauri`
- Handle platform-specific SEA targets (macOS universal, Windows x64, Linux x64/arm64)

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

### 9. Tauri Testing (CDP / WebDriver)

**Priority:** High
**Complexity:** High

The current `@commoners/testing` package uses CDP (Chrome DevTools Protocol) for Electron. Future work:

- Add WebDriver-based testing support for Tauri apps
- Implement page recovery and broken-target cleanup for Tauri's webview
- Support `COMMONERS_REMOTE_DEBUGGING_PORT` for Tauri dev builds
- Add Tauri-specific test helpers to `@commoners/testing`

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

### TODO: Multi-Target Benchmarks

Extend `examples/bench/benchmark.sh` to measure overhead for all build targets:
- **Electron** — binary size, node_modules contribution, startup time
- **Tauri** — binary size comparison vs Electron
- **PWA** — service worker overhead, manifest size
- **Mobile (Capacitor)** — web assets size injected into native project
- **Mobile (Tauri)** — compare with Capacitor mobile overhead

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

### Expand `.env` / Service Ignoring Tests — Testing
- Verify compatible `.env` files are copied
- Verify un-prefixed environment variables are accessible from services and return the correct values
- Note: substantial test infrastructure already exists in `tests/env.test.ts` and `tests/service-env.test.ts`

### ~~Rust `CargoService` Helper~~ — Services (done)
- `CargoService` helper implemented in `packages/core/assets/services/cargo.ts`
- Auto-detects `.rs` source files, resolves Cargo project root, handles cross-platform binary naming

### Starter Kit Overhaul — Release
- The `commoners-starter-kit` repo is outdated (`commoners@0.0.60-alpha.5`) and too minimal — just a counter with no services, plugins, or pages
- `create-commoners` source code was deleted (only compiled output remains); decide whether to restore or deprecate
- Redesign the starter kit as a focused "learn Commoners in an hour" project demonstrating:
  - At least one service (TypeScript HTTP)
  - At least one plugin (e.g., splash screen)
  - Multiple pages with navigation
  - Multi-target config (PWA + desktop)
  - Environment variable usage
- Keep CI/CD workflows (already exist in `commoners-starter-kit`) but update for current Commoners version
- Document in `/docs/getting-started.md` as the recommended starting point, replacing the current `create-vite` + manual setup flow
- The starter kit should be simpler than `examples/demo` (which exercises every feature for testing) but comprehensive enough to show the real value of Commoners

## Low–Medium Lift

### E2E Electron Auto-Close — Testing
- ~~Ensure E2E tests complete; Electron should close down automatically~~ (resolved by Electron 40 upgrade)
- Improve the test suite to check more known behaviors of the API

### Fix GHA Build Tests — Testing (partial)
- CI restructured with lint/typecheck as non-blocking; core build tests passing
- Remaining: full matrix validation across platforms

### Validate Mobile Workflows — Mobile
- Validate B@P iOS workflow end-to-end
- Serial support on iOS and Android

## Medium Lift

### Custom Protocol — Architecture
- Expose services and pages to custom protocol (foundation exists in `packages/core/assets/electron/modules/protocol.ts`)
- Extend custom protocol support to plugins
- Use custom protocol to load `searchQueryParams`
- Only allow existing files for Vite dev mode and published apps (no spontaneous redirects)

### Platform Enhancement — Design
- Write a Platform Enhancement manifesto covering:
  - [Progressive enhancement](https://github.com/voorhoede/progressive-enhancement-resources)
  - [Graceful degradation](https://stackoverflow.com/questions/2550431/what-is-the-difference-between-progressive-enhancement-and-graceful-degradation)
  - [Platform enhancement](https://www.nngroup.com/articles/enhancement/)
- Introduce platform-specific storage options with [conditional guards](https://vite.dev/guide/api-hmr#required-conditional-guard)

### WASM Service Compilation — Architecture
- Compile Rust (and potentially C++) services to WebAssembly for browser-based execution
- Enables running compiled services in PWA targets without a separate server process
- Investigate `wasm-bindgen` + `wasm-pack` integration for Rust→WASM service builds
- Pattern already proven in the SDK repo (`ubcap-protocol-wasm`, `ub-analysis` WASM targets)
- Would pair naturally with the `CargoService` helper (Low Lift roadmap item)

### Walkthroughs — Documentation
- How to use the OpenAPI standard to document services
- How to set up a local service network using `commoners share` and `@commoners/local-services`

## Medium–High Lift

### ASAR Utilities — Architecture
- Fix ASAR on Mac after code signing
- Complete ASAR utilities for Windows compatibility
  - Use native tools (e.g. PowerShell scripts) where necessary, spawned from cross-platform manager scripts
- Fix sandbox behavior on Windows
- Note: extensive infrastructure already exists in `packages/core/utils/asar/`; work is mostly debugging and platform edge cases
- Note: upgrading to `electron-builder@26` may have improved ASAR behavior — retest before deep-diving

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

### Vite Plugin Refactor — Architecture
- Investigate refactoring the core build system as a Vite plugin
- Evaluate which behaviors are too complex for the plugin model and need to remain standalone
- Current system is deeply integrated across build orchestration, services, and multi-target compilation
- Consider how this intersects with Vite 8 / Rolldown — a plugin refactor may be best timed alongside the Vite 8 migration

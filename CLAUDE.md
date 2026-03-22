# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Planning Requirements

Every plan must end with a section answering these three questions:

1. **What ambiguities did you detect?** — List unclear requirements, conflicting signals, or missing information.
2. **What did you assume?** — State the assumptions made to resolve those ambiguities.
3. **Why did you choose this structure?** — Explain the reasoning behind the plan's organization and approach.

## Links

- **Repository**: https://github.com/neuralinterfaces/commoners
- **Documentation**: `docs/` directory (VitePress) — run `pnpm docs` to serve locally
- **Demo app**: `examples/demo/` — run `pnpm demo` to start

## Project Overview

Commoners is a CLI tool and framework for building cross-platform applications (PWA, desktop, mobile) using HTML, CSS, and JavaScript. Users write a single `commoners.config.ts` and the framework handles bundling, service orchestration, and platform-specific packaging.

**Package manager**: PNPM (monorepo with workspaces)
**Node requirement**: >=20.0.0
**Current version**: 1.0.0-alpha.3

## Monorepo Structure

```
packages/
  cli/            → `commoners` CLI (bin: dist/index.cjs)
  core/           → `@commoners/solidarity` — config resolution, build, services, Vite integration
  testing/        → `@commoners/testing` — Playwright-based E2E testing utilities
  create-commoners/ → `create-commoners` scaffolding tool
  plugins/
    splash-screen/  → `@commoners/splash-screen`
    windows/        → `@commoners/windows`
    local-services/ → `@commoners/local-services`
    devices/ble/    → `@commoners/bluetooth`
    devices/serial/ → `@commoners/serial`
examples/
  demo/           → Comprehensive test/demo application (commoners.config.ts)
tests/            → Vitest test suite (run from repo root)
docs/             → VitePress documentation site
```

## Development Commands

### Building
- `pnpm build` — Build all packages (`pnpm -r run build`)
- `pnpm -C packages/core run build` — Build just the core package
- `pnpm -r run watch` — Watch mode for all packages

### Testing
- `pnpm test` — Run all tests (Vitest)
- `pnpm test:start` — Start tests (32 tests, web + mobile targets)
- `pnpm test:config` — Config resolution tests
- `pnpm test:security` — Security tests
- `pnpm test:desktop` — Desktop/Electron start tests
- `pnpm test:services` — Service compilation tests (requires `conda activate commoners-demo`)
- `pnpm test:wasm` — WASM service tests
- `pnpm test:build` — Build process tests
- `pnpm test:env` — Environment variable tests
- `pnpm test:protocol` — Protocol handler tests
- `pnpm test:mobile-workflow` — Mobile workflow tests
- `pnpm coverage` — Test coverage (`vitest run --coverage`)

### Demo
- `pnpm demo` — Start demo app in dev mode
- `pnpm demo:build` — Build demo for production
- `pnpm demo:launch` — Launch built demo

### Code Quality
- `pnpm lint` — ESLint with auto-fix
- `pnpm lint:check` — ESLint check only
- `pnpm format` — Prettier format all files
- `pnpm typecheck` — TypeScript type checking across all packages

### Documentation
- `pnpm docs` — VitePress dev server
- `pnpm docs:build` — Build documentation

### Release
- `pnpm release` — Build all + changeset publish

## Architecture

### Configuration System

Projects define a `commoners.config.ts` that is resolved by `packages/core/index.ts:resolveConfig()`. The config supports:
- **Extensions** (unified plugins + services): `config.extensions` is the canonical record
- **Plugins**: Frontend hooks (`load`, `start`, `ready`, `quit`) + desktop hooks (`desktop.load`, `desktop.preload`, `desktop.quit`)
- **Services**: Backend processes in JS/TS, Python, C++, or Rust
- **Pages**: Multi-page app support
- **Hooks**: Build lifecycle hooks
- **Electron config**: Desktop-specific settings

Config is bundled **3 ways**:
1. **Node.js loading** (`loadConfigFromFile`) — esbuild, single ESM file for initial resolution
2. **Browser bundle** (`.mjs`) — Vite/Rollup, for frontend runtime; only includes `plugins`
3. **Electron bundle** (`.cjs`) — Vite/Rollup, for Electron main process; includes `name`, `icon`, `electron`, `plugins`, `services`, `hooks`

Automatic config stripping removes irrelevant properties per target (e.g., service `src`/`port`/`build` from browser bundles, browser-only hooks from Electron bundles).

User-facing compile-time guards: `__COMMONERS_TARGET__`, `__COMMONERS_DESKTOP__`, `__COMMONERS_MOBILE__`, `__COMMONERS_WEB__`, `__COMMONERS_ELECTRON__`, `__COMMONERS_TAURI__`, `__COMMONERS_IOS__`, `__COMMONERS_ANDROID__`.

### Build Targets

- **Web/PWA**: Vite-based progressive web apps
- **Desktop**: Electron-based (Tauri planned; currently throws `PlatformError`)
- **Mobile**: Capacitor-based iOS/Android

Target types defined in `packages/core/types.ts`:
- Universal: `desktop`, `mobile`, `pwa`, `web`
- Specific: `electron`, `tauri`, `ios`, `android`

### Services

Services can be written in multiple languages:
- **JS/TS**: Bundled with esbuild
- **Python**: Packaged with PyInstaller (requires conda environment)
- **C++**: Custom build commands (requires `g++`)
- **Rust**: Cargo build with dev/release profiles
- **WASM**: `WasmCargoService` in `packages/core/services/wasm.ts`

Service paths:
- Dev: `.commoners/.tmp/services/`
- Build: `.commoners/services/`

### Extensions System

`ResolvedConfig.extensions` is the canonical unified record of plugins + services. Legacy `config.plugins` and `config.services` remain as views with shared object references.

- Classification: `classifyExtensions()` in `index.ts`
- Runtime loading: `packages/core/assets/onload.ts`
- Query API: `commoners.query()` filters by capabilities via `queryExtensions()`
- Adapter helpers: `getPlugins()` / `getServices()` from `utils/extensions.ts`

### Electron Integration

- Main process: `packages/core/assets/electron/main.ts` (bundled by Rollup from `dist/`)
- Preload: bundled as CJS (no top-level await)
- IPC: `sendSync` for initial calls, `invoke`/`handle` for async
- Testing: CDP connection with broken-target cleanup (splash screen workaround)

**Important**: Do NOT import across `assets/electron/` → `utils/` boundary — inline small utilities instead.

### Build Flow

The build system uses the Strategy pattern (`packages/core/flows/`):
- `BuildFlow` dispatches to registered strategies
- `ElectronBuildStrategy`, `MobileBuildStrategy`, `WebBuildStrategy`
- Extensible: add new strategies for new targets (e.g., Tauri)

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/index.ts` | Config resolution (`resolveConfig`), service management |
| `packages/core/build.ts` | Build orchestration |
| `packages/core/start.ts` | Dev server startup |
| `packages/core/launch.ts` | App launching |
| `packages/core/types.ts` | Core TypeScript types, target definitions |
| `packages/core/globals.ts` | Platform constants, target resolution |
| `packages/core/cleanup.ts` | Process cleanup, signal handling |
| `packages/core/utils/assets.ts` | Config bundling (`bundleConfig`), asset building |
| `packages/core/utils/extensions.ts` | Extension classification helpers |
| `packages/core/utils/paths.ts` | Path constants and utilities |
| `packages/core/utils/security.ts` | ASAR integrity, code signing |
| `packages/core/vite/plugins/commoners.ts` | Vite plugin — injects globals |
| `packages/core/assets/electron/main.ts` | Electron main process |
| `packages/core/assets/electron/preload.ts` | Electron preload script |
| `packages/core/assets/onload.ts` | Plugin runtime loading |
| `packages/core/services/wasm.ts` | WASM service class |
| `packages/core/flows/index.ts` | Build flow + strategy registration |
| `examples/demo/commoners.config.ts` | Comprehensive demo configuration |
| `tests/utils.ts` | Shared test utilities |

## Testing Notes

### Requirements
- `g++` for C++ service tests
- `conda activate commoners-demo` for Python service tests (PyInstaller on PATH)
- Linux: FUSE required (`sudo apt-get install -y fuse`)

### Architecture
- **Framework**: Vitest with 2-minute timeout per test
- **Parallelism**: `fileParallelism: false` — tests share `.commoners/.tmp` via single-instance lock
- **Do NOT** run test suites concurrently (port conflicts, especially port 2345)
- Desktop test order: `desktop-build.test.ts` → `desktop.test.ts` → `desktop-zlaunch.test.ts`
- `index.test.ts` is excluded (redundant aggregator)

### Known Issues
- Desktop start tests: flaky in full suite (page closes mid-test), stable in isolation
- Echo test timeout: 90s to handle full-suite resource contention
- Pre-commit hook runs `eslint --fix` via lint-staged — many pre-existing lint errors exist

### Test Coverage Gaps
- No E2E test for Electron protocol handler serving plugin assets (`commoners://plugins/...`)
- No test for config stripping correctness (browser vs Electron bundle contents)

## CI/CD

GitHub workflows in `.github/workflows/`:
- `ci.yml` — Continuous integration
- `testing.yml` — Test suite
- `security-audit.yml` — Dependency vulnerability audits
- `vitepress-gh-pages.yml` — Documentation deployment

Dependabot configured for weekly npm updates (`.github/dependabot.yml`).

## Code Style

- **Formatter**: Prettier — 2 spaces, single quotes, no semicolons, 100 char width
- **Linter**: ESLint v9+ flat config with TypeScript + Prettier integration
- **Config**: `eslint.config.js`, `.prettierrc.json`

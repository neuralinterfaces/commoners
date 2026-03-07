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

### Fix `import.meta.url` on Windows — Desktop
- Windows path handling pattern already exists in `packages/core/globals.ts`; needs consistent application across the codebase

### Scope Device Modal Styles — Plugins
- Add dark mode support via `prefers-color-scheme` (Shadow DOM already provides scoping)
- Export modals but don't show by default

### Expand `.env` / Service Ignoring Tests — Testing
- Verify compatible `.env` files are copied
- Verify un-prefixed environment variables are accessible from services and return the correct values
- Note: substantial test infrastructure already exists in `tests/env.test.ts` and `tests/service-env.test.ts`

### Review Starter Kit — Release
- Verify `create-commoners` scaffolding still works end-to-end

## Low–Medium Lift

### E2E Electron Auto-Close — Testing
- ~~Ensure E2E tests complete; Electron should close down automatically~~ (resolved by Electron 40 upgrade)
- Improve the test suite to check more known behaviors of the API

### Fix GHA Build Tests — Testing
- Troubleshoot and fix CI workflow failures in `.github/workflows/`

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
- Evaluate difficulty of providing Tauri analogues for all Electron-specific behaviors
- Swap Tauri for Electron when no Electron-specific plugins are used
- No existing implementation; requires research, design, and significant new code

### Vite Plugin Refactor — Architecture
- Investigate refactoring the core build system as a Vite plugin
- Evaluate which behaviors are too complex for the plugin model and need to remain standalone
- Current system is deeply integrated across build orchestration, services, and multi-target compilation
- Consider how this intersects with Vite 8 / Rolldown — a plugin refactor may be best timed alongside the Vite 8 migration

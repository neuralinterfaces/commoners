# Commoners Roadmap

## Path to 1.0.0

Four items gate a confident 1.0.0 release. Everything else is post-1.0.

### ~~1. CI Test Coverage~~ ✅ Done

`test:fast-unit` (17 files, 457 tests) is wired into `ci.yml` (3 OS × 2 Node versions) and `testing.yml` (daily, 3 OS). All tests pass on Windows.

### ~~2. Windows ASAR Hardening~~ ✅ Done

PowerShell verification script fixed (field name + JSON format bugs), CI step exists in `desktop-build.yml`. See [`docs/roadmap/asar-hardening.md`](./docs/roadmap/asar-hardening.md).

### ~~3. Desktop Test Stability~~ ✅ Done

Verified on Windows: `desktop.test.ts` (23/24 pass) and `start.test.ts` (26/28 pass). All failures are C++ service echo tests (broken MinGW toolchain, not a stability issue). No port contention, no page-close flakiness. Mitigations in place: `fileParallelism: false`, port retry logic, CDP target cleanup.

### ~~4. Documentation~~ ✅ Done

New docs added:
- **API Reference** (`docs/reference/api.md`) — bus, api, query(), capabilities, services, pages
- **Plugin Guide** rewritten — lifecycle ordering, `after` dependencies, error isolation, IPC, lazy loading, extensions
- **Testing Guide** rewritten — multi-window API (pages, findPage, waitForPage), desktop/mobile/build testing
- Sidebar updated with API reference link

---

## Post-1.0 (1.x)

### Vite 8 / Rolldown Migration

Audit complete — 10 hooks, 6 config options, 2 standalone esbuild calls. One critical item: `inlineDynamicImports` for Electron preload may not have a Rolldown equivalent. Execute the migration checklist in [`docs/roadmap/vite-evolution.md`](./docs/roadmap/vite-evolution.md) when Vite 8 ships.

### Build Adapter Interface (Phase 1 done)

Phase 1 complete: `BuildAdapter` interface + `ViteBuildAdapter` default + `ServiceBundler` interface. `BuildFlow.buildFrontendAssets()` uses the adapter. Zero behavior change.

**Remaining (Phase 2-3):** Replace direct Vite imports in `start.ts`, `utils/assets.ts`. Plugin adapter layer for non-Vite bundlers. See [`docs/roadmap/build-adapter-interface.md`](./docs/roadmap/build-adapter-interface.md).

### Platform Abstractions

Cross-platform Storage, Notification, Context, and File System adapters. Designed but not planned for implementation. See [`docs/roadmap/platform-abstractions.md`](./docs/roadmap/platform-abstractions.md).

### Tauri Remaining Work

- SEA cross-compilation (universal binaries)
- Tauri dev mode E2E testing (unit tests done, 104 tests; need real `tauri dev` integration test)
- See [`docs/roadmap/tauri-future-work.md`](./docs/roadmap/tauri-future-work.md)

### Multi-Window Testing (`@commoners/testing`)

`open()` currently returns a single `page` — the first page where `globalThis.commoners` exists. This breaks apps with plugin-created windows (e.g., auth splash screens) that don't have the commoners global.

**Problem:** The auth plugin creates a BrowserWindow in `ready()` that blocks the main window. The test framework can't interact with it — it only finds the main window, which is blank until auth completes. Tests written before the strip-keys fix worked accidentally because auth never ran.

**Ideal API:**
```ts
const ctx = await open(ROOT)
ctx.pages.home     // main window Page
ctx.pages.auth     // auth splash Page (created by plugin ready())
ctx.pages.profile  // profile page (when navigated)
```

This aligns with how commoners already tracks windows — the main process Window module has `__id`-keyed windows, and plugins track windows in `this.WINDOWS`. The testing layer just doesn't expose them.

**Implemented (partial):** `open()` now returns `pages`, `findPage(predicate)`, and `waitForPage(key)`. Pages auto-update via CDP `page` events. Config pages and plugin asset pages are matched by URL pattern.

**Remaining:**
- Validate `waitForPage('auth')` works with Neurotique's auth splash screen end-to-end
- Ensure `pages` record keys match config keys reliably across dev/build modes
- Update `plugins.test.ts` to use the new multi-window API (8 desktop E2E failures)

### Testing Expansion

- Native emulator testing (Android/iOS)
- Automated mobile distribution (App Store / Play Store CI/CD)
- Full E2E protocol tests (build+launch Electron)
- E2E WASM compilation test (requires Rust toolchain)
- See [`docs/roadmap/testing-and-distribution.md`](./docs/roadmap/testing-and-distribution.md)

### Security Plugins

- `@commoners/integrity` — runtime verification for ASAR + service binaries + WASM
- `@commoners/secure-services` — per-session auth tokens for service communication
- `@commoners/audit` — SBOM generation, multi-language dependency auditing
- See [`docs/roadmap/security-whitepaper.md`](./docs/roadmap/security-whitepaper.md)

### Device Communication Abstraction

`commoners.bluetooth` / `commoners.serial` API with per-runtime adapters. Deferred — large scope (4-6 weeks), waiting on Tauri mobile plugin ecosystem maturity. See [`docs/roadmap/device-communication-abstraction.md`](./docs/roadmap/device-communication-abstraction.md).

### Tauri Mobile Backend

When Tauri's mobile plugin ecosystem matures (BLE plugin at 1.0+, multi-maintainer), offer Tauri mobile as an alternative to Capacitor. See [`docs/roadmap/tauri-integration-reference.md`](./docs/roadmap/tauri-integration-reference.md).

---

<details>
<summary><strong>Completed</strong> (29 items + Batch B + Batch D)</summary>

### Batch B — Tauri Desktop Backend (done)

`DesktopRuntime` abstraction, `createElectronRuntime()` + `createTauriRuntime()` adapters, `sendSync` elimination, sidecar lifecycle with generated `main.rs`. 104 Tauri tests.

### Batch D — Architecture Improvements (8/8 done)

Typed command registry, capabilities-driven IPC allowlist, plugin capability declarations, plugin hot reload, service health monitoring, window event bus, unified async API, declarative service bundling.

### Other Completed Items

| Item | Category |
|------|----------|
| Fix `ELECTRON_STRIP_KEYS` — lifecycle hooks were stripped from Electron config | Desktop |
| Sequential `ready()` hooks + `after[]` plugin dependency ordering | Architecture |
| Fix `onReady` promise chain (`.catch()` on void) | Desktop |
| `lifecycleProbe` regression test for config stripping | Testing |
| Windows ASAR PowerShell verification script fix | Security |
| Multi-window testing API (`pages`, `findPage`, `waitForPage`) | Testing |
| Fix `import.meta.url` on Windows | Desktop |
| Scope Device Modal Styles | Plugins |
| Split Tests into Individually Runnable Units | Testing |
| Expand `.env` / Service Ignoring Tests | Testing |
| Rust `CargoService` Helper | Services |
| Starter Kit Overhaul | Release |
| Homepage & Why Page Messaging | Documentation |
| `commoners share` CLI Command | CLI |
| E2E Electron Auto-Close | Testing |
| Fix GHA Build Tests | Testing |
| Headless Mobile Testing | Testing |
| Validate Mobile Workflows | Mobile |
| Fix Pre-existing Test Failures | Testing |
| Extensions Unification | Architecture |
| Electron IPC Async Migration | Desktop |
| Custom Protocol | Architecture |
| Platform Enhancement | Design |
| WASM Service Compilation | Architecture |
| Walkthroughs | Documentation |
| macOS ASAR Post-Sign Verification | Architecture |
| Vite Evolution Audit | Architecture |
| Security Whitepaper (P0/P1 items) | Security |

</details>

<details>
<summary><strong>Dependency History</strong> (resolved)</summary>

**Electron Beta Pin:** Pinned to `39.0.0-beta.1` to work around Electron 38 service environment bug. Resolved by upgrading to stable `^40.8.0`.

**electron-builder Pin:** Pinned to `24.13.3` due to 25.x signing/ASAR breaking changes. Resolved by upgrading to `^26.8.1`.

</details>

---

## Reference Documents

- [`docs/roadmap/features.md`](./docs/roadmap/features.md) — Detailed implementation plans by batch
- [`docs/roadmap/windows-verification.md`](./docs/roadmap/windows-verification.md) — Windows build/signing checklist
- [`docs/roadmap/sandbox-investigation.md`](./docs/roadmap/sandbox-investigation.md) — `app.enableSandbox()` Windows freeze workaround
- [`docs/roadmap/tauri-integration-reference.md`](./docs/roadmap/tauri-integration-reference.md) — Tauri ecosystem comparison

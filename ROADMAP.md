# Commoners Roadmap

## Path to 1.0.0

Four items gate a confident 1.0.0 release. Everything else is post-1.0.

### 1. CI Test Coverage (blocking)

Only ~3 test files run in CI. Wire the full unit test suite into `ci.yml`:

- `security.test.ts` (77 tests), `asar.test.ts`, `protocol.test.ts`, `port-retry.test.ts`, `port-pid.test.ts`
- `api.test.ts` (55 tests), `tauri.test.ts` (104 tests), `config-stripping.test.ts`
- `formatting.test.ts`, `hooks.test.ts`, `errors.test.ts`, `plugin-lifecycle.test.ts`

**Effort:** Config only — add a `test:fast-unit` script and a CI step. No new tests needed.

### 2. Windows ASAR Hardening (blocking)

macOS ASAR integrity is done (`afterSignVerifyAsarIntegrity()`). Windows needs:

- PowerShell verification script (parse 12-byte prelude, compute SHA256, compare via `rcedit`)
- CI step in `desktop-build.yml` for Windows verification
- Existing infrastructure in `packages/core/utils/asar/`; see [`docs/roadmap/asar-hardening.md`](./docs/roadmap/asar-hardening.md)

**Effort:** Half day.

### 3. Desktop Test Stability (blocking)

Desktop start tests are flaky when run in the full suite (page closes mid-test due to port conflicts). Fix isolation so `pnpm test` passes reliably end-to-end.

**Effort:** Half day. Root cause is port 2345 contention between test files.

### 4. Documentation (blocking)

VitePress docs need to cover the new APIs added during architecture work:

- `commoners.bus` (event bus), `commoners.api` (async API), `commoners.query()` (extension querying)
- Service health monitoring, plugin capabilities, plugin hot reload
- Typed IPC commands, capabilities-driven allowlist

**Effort:** 1-2 days.

---

## Post-1.0 (1.x)

### Vite 8 / Rolldown Migration

Audit complete — 10 hooks, 6 config options, 2 standalone esbuild calls. One critical item: `inlineDynamicImports` for Electron preload may not have a Rolldown equivalent. Execute the migration checklist in [`docs/roadmap/vite-evolution.md`](./docs/roadmap/vite-evolution.md) when Vite 8 ships.

### Build Adapter Interface

Pluggable frontend bundler (`BuildAdapter`) + service compiler (`ServiceBundler`). Phase 1 pairs naturally with Vite 8 migration. See [`docs/roadmap/build-adapter-interface.md`](./docs/roadmap/build-adapter-interface.md).

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

**Implementation:**
1. **Expose all pages:** `open()` should return `{ pages: Record<string, Page>, mainPage: Page }` or provide `findPage(predicate)` to locate pages by URL pattern or selector
2. **Map config keys to pages:** Config-declared pages (`pages: { home, profile, settings }`) and plugin asset pages (`authPlugin("auth/index.html")`) should be discoverable by their config key
3. **Window event tracking:** Use CDP `Target.targetCreated` events to track new windows as they appear, making plugin-created windows findable as soon as they open
4. **Auth-aware test flow:** Add a `waitForPage(key)` helper that blocks until a specific page appears, enabling test flows like: get auth page → fill password → wait for main page

**Effort:** 1-2 days. CDP infrastructure already exists in `open()`.

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

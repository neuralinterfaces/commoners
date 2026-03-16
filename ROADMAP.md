# Commoners Roadmap

## 1.0.0 Status

All four release gate items are complete:

1. **CI test coverage** -- `test:fast-unit` (17 files, 457 tests) in `ci.yml` (3 OS x 2 Node) and `testing.yml` (daily). All pass on Windows.
2. **Windows ASAR hardening** -- PowerShell verification fixed, CI step in `desktop-build.yml`. macOS was already done.
3. **Desktop test stability** -- Verified on Windows: desktop (23/24) and start (26/28) pass. Remaining failures are C++ toolchain issues, not stability. Port contention mitigated.
4. **Documentation** -- API reference, plugin guide, testing guide all shipped.

---

## Post-1.0 Priorities

### Near-term (1.1)

- **Auto-update integration** -- Wire `electron-updater` to GitHub Releases with hash verification. Current plugin is a stub.
- **Activate ServiceHealthMonitor** -- Class exists with health checks, auto-restart, status tracking. Needs to be wired into service `start()` behind config flag.
- **Plugin runtime abstraction** -- Pass `DesktopRuntime` to plugins instead of raw Electron APIs. Last abstraction gap for Tauri plugin compatibility.
- **Orphan process cleanup** -- Detect and kill stale service processes from crashed dev sessions.
- **Multi-window testing validation** -- Validate `waitForPage('auth')` with Neurotique's auth flow. Update `plugins.test.ts` to use multi-window API.

### Medium-term

- **Vite 8 / Rolldown migration** -- Audit complete (10 hooks, 6 config options, 1 critical: `inlineDynamicImports`). Execute when Vite 8 ships. See [vite-evolution.md](./docs/roadmap/vite-evolution.md).
- **Testing expansion** -- Protocol E2E, WASM E2E, mobile build output, native emulator testing. See [testing-and-distribution.md](./docs/roadmap/testing-and-distribution.md).
- **Tauri remaining work** -- SEA cross-compilation, dev mode testing (requires built app for tauri-driver). See [tauri-future-work.md](./docs/roadmap/tauri-future-work.md).

### Long-term (demand-driven)

- **Device communication abstraction** -- `commoners.bluetooth` / `commoners.serial` per-runtime adapters. Blocked by Tauri device plugin maturity. See [device-communication-abstraction.md](./docs/roadmap/device-communication-abstraction.md).
- **Tauri mobile backend** -- Offer Tauri mobile as Capacitor alternative. Waiting on `tauri-plugin-blec` 1.0+.
- **Build adapter interface** -- Pluggable frontend bundler. Phase 1 done (`BuildAdapter` + `ViteBuildAdapter`). Phase 2-3 only if Vite 8 forces changes. See [build-adapter-interface.md](./docs/roadmap/build-adapter-interface.md).
- **Platform abstractions** -- Storage, Notification, File System adapters. Deferred -- overlaps with Capacitor/Tauri ecosystems. See [platform-abstractions.md](./docs/roadmap/platform-abstractions.md).
- **Security plugins** -- `@commoners/integrity` and `@commoners/secure-services` ship with 1.0. `@commoners/audit` (SBOM, dependency auditing) is post-1.0. See [security-whitepaper.md](./docs/roadmap/security-whitepaper.md).

---

## Completed

### Release Gate (4/4)
CI test coverage. Windows ASAR hardening. Desktop test stability. Documentation (API reference, plugin guide, testing guide).

### Tauri Desktop Backend
`DesktopRuntime` interface + Electron/Tauri implementations. Build/launch strategies for both. Sidecar lifecycle with generated `main.rs`. Tauri E2E test (builds demo, launches via tauri-driver, verifies commoners global). 104 Tauri tests.

### Architecture (Batch D, 8/8)
Typed command registry. Capabilities-driven IPC allowlist. Plugin capability declarations. Plugin hot reload. Service health monitoring (class). Window event bus. Unified async API (`commoners.api`). Declarative service bundling.

### Security (P0/P1)
IPC channel validation. ASAR integrity (macOS + Windows). Binary hash verification. CSP with dynamic generation. Code signing integration. Secure Services plugin. 77 security tests.

### Individual Items (29)
Extensions unification. IPC async migration (sendSync eliminated). Custom protocol. WASM compilation (wasm-pack). macOS ASAR post-sign verification. Vite evolution audit. CargoService helper. Mobile workflow validation. Documentation overhaul. Dev output cleanup. Plugin dependency ordering. Capability querying (`commoners.query()`). Event bus (`commoners.bus`). Cross-platform icons. Multi-window testing API. Sequential ready() hooks. Config stripping fix + regression test. Starter kit overhaul. `commoners share` command. And more -- see git history.

### Resolved Dependencies
- Electron pinned to 39 beta (service env bug) -- resolved by upgrading to stable ^40.8.0
- electron-builder pinned to 24.x (signing/ASAR breaking changes) -- resolved by upgrading to ^26.8.1

---

## Reference Documents

- [docs/roadmap/features.md](./docs/roadmap/features.md) -- Detailed implementation plans
- [docs/roadmap/windows-verification.md](./docs/roadmap/windows-verification.md) -- Windows build/signing checklist
- [docs/roadmap/sandbox-investigation.md](./docs/roadmap/sandbox-investigation.md) -- `app.enableSandbox()` Windows freeze workaround
- [docs/roadmap/tauri-integration-reference.md](./docs/roadmap/tauri-integration-reference.md) -- Tauri ecosystem comparison

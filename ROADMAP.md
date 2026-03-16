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

- **Auto-update production validation** -- Plugin rewritten but untested with real GitHub Releases. Needs end-to-end verification. Requires: GitHub repo with releases configured.
- **iOS TestFlight validation** -- Manual publishing docs written, needs end-to-end test. Requires: Apple Developer account.
- **Android Play Store validation** -- Signing + CI docs written, needs end-to-end test. Requires: Google Play Console access.
- **Platform abstractions: notifications, context** -- `commoners.notifications`, `commoners.context` across Electron and browser. Storage done (`@commoners/storage`).

### Medium-term

- **Testing expansion** -- Mobile build output tests, native emulator testing. Protocol E2E and WASM E2E are done. See [testing-and-distribution.md](./docs/roadmap/testing-and-distribution.md).
- **Tauri remaining work** -- SEA cross-compilation, dev mode testing, Tauri IPC bridge, code signing. See [tauri-future-work.md](./docs/roadmap/tauri-future-work.md).

### Long-term (demand-driven)

- **Device communication abstraction** -- `commoners.bluetooth` / `commoners.serial` per-runtime adapters. Blocked by Tauri device plugin maturity. See [device-communication-abstraction.md](./docs/roadmap/device-communication-abstraction.md).
- **Tauri mobile backend** -- Offer Tauri mobile as Capacitor alternative. Waiting on `tauri-plugin-blec` 1.0+.
- **Build adapter interface** -- Phase 1 done. Phase 2-3 only if Vite creates breaking changes. See [build-adapter-interface.md](./docs/roadmap/build-adapter-interface.md).

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

### Post-1.0 Completed
Vite 8.0.0 migration (Rolldown bundler). Auto-update plugin rewrite. ServiceHealthMonitor wired into service start() with 11 tests. Orphan process cleanup (PID file). Plugin runtime abstraction. `@commoners/audit` plugin (SBOM generation, multi-language dependency scanning). `@commoners/storage` plugin (IndexedDB for web, Node fs for Electron, Capacitor Preferences for mobile). Build adapter test fix (factory pattern). `commoners init` command. Migration guide. Platform docs (web/PWA, Electron vs Tauri, iOS/Android publishing).

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

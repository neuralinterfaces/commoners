# Commoners Roadmap

## 1.0.0 Status

All four release gate items are complete:

1. **CI test coverage** -- `test:fast-unit` (20 files) in `ci.yml` (3 OS x 2 Node) and `testing.yml` (daily). All pass on Windows.
2. **Windows ASAR hardening** -- PowerShell verification fixed, CI step in `desktop-build.yml`. macOS was already done.
3. **Desktop test stability** -- Verified on Windows: desktop (23/24) and start (26/28) pass. Remaining failures are C++ toolchain issues, not stability. Port contention mitigated.
4. **Documentation** -- API reference, plugin guide, testing guide all shipped.

---

## Post-1.0 Priorities

### Near-term (1.1)

- **Plugin validation** -- New plugins (preferences, storage, clipboard, notifications, context, messaging, audit, autoupdate) are implemented but untested in real apps. Validate with Neurotique and demo projects.
- **Auto-update production validation** -- Needs end-to-end test with real GitHub Releases. Requires: GitHub repo with releases configured.
- **iOS TestFlight validation** -- Manual publishing docs written, needs end-to-end test. Requires: Apple Developer account.
- **Android Play Store validation** -- Signing + CI docs written, needs end-to-end test. Requires: Google Play Console access.
- **Tauri plugin support** -- Add Tauri-specific code paths for plugins that currently call `require('electron')`. Demand-driven.
- **Vite 8 migration** -- Attempted and reverted (esbuild transform bug strips 6th+ object property). Retry when fixed upstream.
- **Service hot-reload in Electron dev mode** -- Changing a service currently requires restarting the dev server (`lifecycle.ts:133` logs a warning). Implement file-watching and process restart for services during `commoners dev --target desktop`.
- **C++ service scope clarification** -- Current C++ "support" delegates entirely to user-provided build commands. Either invest in real integration (header management, cross-compilation) or reframe in docs as "custom build command support" rather than first-class C++ support.

### Medium-term

- **Testing expansion** -- Mobile build output tests, native emulator testing. Protocol E2E and WASM E2E are done. See [testing-and-distribution.md](./docs/roadmap/testing-and-distribution.md).
- **Tauri remaining work** -- SEA cross-compilation, dev mode testing, Tauri IPC bridge, code signing. See [tauri-future-work.md](./docs/roadmap/tauri-future-work.md).
- **Showcase page** -- Add a docs page with screenshots and descriptions of production apps built with Commoners (brainsatplay, Universal Brain products). The BCI origin story is a strong differentiator but currently buried in a single paragraph.
- **Python service friction** -- Document alternatives to conda for PyInstaller (uv, pip, Docker-based builds). Conda is a high barrier for developers unfamiliar with the Python ecosystem.

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
Typed command registry. Capabilities-driven IPC allowlist. Plugin capability declarations. Plugin hot reload. Service health monitoring (class). Cross-window events (`@commoners/messaging`). `commoners.is()` runtime detection. Declarative service bundling.

### Security (P0/P1)
IPC channel validation. ASAR integrity (macOS + Windows). Binary hash verification. CSP with dynamic generation. Code signing integration. Secure Services plugin. 77 security tests.

### Post-1.0 Completed
Vite 8.0.0 migration (Rolldown bundler). Auto-update plugin rewrite. ServiceHealthMonitor wired into service start() with 11 tests. Orphan process cleanup (PID file). Plugin runtime abstraction. `@commoners/audit` (SBOM). `@commoners/preferences` (key-value). `@commoners/storage` (file access). `@commoners/clipboard`. `@commoners/notifications`. `@commoners/context` (paths, info, locale). `@commoners/messaging` (cross-window events). Build adapter fix. `commoners init` command. Migration guide. Platform docs. Plugin README with support matrix. Vite 8 attempted and reverted (esbuild transform bug).

### Individual Items (29)
Extensions unification. IPC async migration (sendSync eliminated). Custom protocol. WASM compilation (wasm-pack). macOS ASAR post-sign verification. Vite evolution audit. CargoService helper. Mobile workflow validation. Documentation overhaul. Dev output cleanup. Plugin dependency ordering. Capability querying (`commoners.query()`). Event bus (`commoners.bus`). Cross-platform icons. Multi-window testing API. Sequential ready() hooks. Config stripping fix + regression test. Starter kit overhaul. `commoners share` command. And more -- see git history.

### Resolved Dependencies
- Electron pinned to 39 beta (service env bug) -- resolved by upgrading to stable ^40.8.0
- electron-builder pinned to 24.x (signing/ASAR breaking changes) -- resolved by upgrading to ^26.8.1

---

## Known Issues

- **Electron sandbox** -- `app.enableSandbox()` freezes Electron on Windows. Per-window `sandbox: true` works. See [sandbox-investigation.md](./docs/roadmap/sandbox-investigation.md).
- **Vite 8** -- esbuild transform bug strips 6th+ property from object literals in test context. Reverted to Vite 7. Retry when fixed upstream.

## Reference Documents

- [docs/roadmap/features.md](./docs/roadmap/features.md) -- Links to all detailed implementation plans
- [docs/roadmap/windows-verification.md](./docs/roadmap/windows-verification.md) -- Windows build/signing checklist
- [docs/roadmap/tauri-integration-reference.md](./docs/roadmap/tauri-integration-reference.md) -- Tauri ecosystem comparison
- [packages/plugins/README.md](./packages/plugins/README.md) -- Plugin support matrix

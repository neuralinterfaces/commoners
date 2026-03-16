# Feature Roadmap

## 1.0.0 Release Gate

Three items remain before shipping 1.0.0.

| # | Item | Effort | Status |
|---|------|--------|--------|
| 1 | **CI test coverage** | Low (config) | Add `test:fast-unit` to CI; run security (77), API (55), Tauri (104), protocol, ASAR, config-stripping, hooks, errors, formatting, plugin-lifecycle tests |
| 2 | **Windows ASAR hardening** | Half day | PowerShell verification + `desktop-build.yml` CI step. macOS done. See [asar-hardening.md](./asar-hardening.md) |
| 3 | **Desktop test stability** | Half day | Fix port 2345 contention in full suite. Tests pass individually but fail when combined |

---

## Post-1.0 Priorities

Ordered by impact. Each links to a detailed plan.

### Medium-term

| Item | Document | Status |
|------|----------|--------|
| [Testing + Distribution](./testing-and-distribution.md) | Mobile build output tests, native emulator testing. Protocol E2E and WASM E2E done. | Planned |
| [Tauri Future Work](./tauri-future-work.md) | SEA cross-compilation, dev mode testing, IPC bridge, code signing | Remaining |

### Long-term (demand-driven)

| Item | Document | Notes |
|------|----------|-------|
| [Device Communication Abstraction](./device-communication-abstraction.md) | `commoners.bluetooth` / `commoners.serial` per-runtime adapters | Blocked by Tauri device plugin maturity |
| Tauri Mobile Backend | Offer Tauri mobile as Capacitor alternative | Waiting on `tauri-plugin-blec` 1.0+ |
| [Build Adapter Interface](./build-adapter-interface.md) | Pluggable frontend bundler. Only if Vite 8 forces changes. | Design phase |
| [Platform Abstractions](./platform-abstractions.md) | Storage, Notification, File System adapters | Deferred -- overlaps with Capacitor/Tauri plugin ecosystems |

---

## Completed

Everything below is done and in the codebase.

### Tauri Desktop Backend
`DesktopRuntime` interface + Electron/Tauri implementations. Build/launch strategies for both runtimes. Sidecar lifecycle management. 104 Tauri-specific tests.

### Architecture Improvements (Batch D, 8/8)
Typed command registry, capabilities-driven IPC allowlist, plugin capability declarations, plugin hot reload, service health monitoring (class), window event bus, unified async API (`commoners.api`), declarative service bundling.

### Security (P0/P1)
IPC channel validation with allowlists. ASAR integrity embedding (macOS verified). Binary hash verification for service executables. CSP with dynamic generation. Code signing integration. Secure Services plugin (per-session tokens). 77 security tests.

### Post-1.0 Items (completed)
Vite 8.0.0 upgrade (Rolldown bundler). Auto-update plugin rewrite. ServiceHealthMonitor wired into service start(). Orphan process cleanup (PID file). Plugin runtime abstraction (`DesktopRuntime` in plugin context type).

### Individual Items (29)
Extensions unification. Electron IPC async migration (sendSync eliminated). Custom protocol handler. WASM service compilation (wasm-pack). macOS ASAR post-sign verification. Vite evolution audit. CargoService helper. Mobile workflow validation (Capacitor iOS/Android). Documentation overhaul (tagline, homepage, getting started, competitor comparison, API reference). Dev output cleanup (service logging, noise removal, Windows file-mode navigation fix). Plugin dependency ordering (topological sort). Capability-driven extension querying (`commoners.query()`). Event bus (`commoners.bus`). Cross-platform icon handling.

### Reference Documents
- [Windows Verification Checklist](./windows-verification.md)
- [Sandbox Investigation](./sandbox-investigation.md)
- [Tauri Integration Reference](./tauri-integration-reference.md)
- [Security Whitepaper](./security-whitepaper.md) (P0/P1 complete)
- [Electron Coupling Audit](./electron-coupling-audit.md)
- [ASAR Integrity Hardening](./asar-hardening.md) (macOS complete)

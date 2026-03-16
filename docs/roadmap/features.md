# Feature Roadmap

## 1.0.0 Release Gate -- COMPLETE

All items resolved. See [ROADMAP.md](../../ROADMAP.md) for details.

---

## Post-1.0 Priorities

Ordered by impact.

### Near-term (1.1)

| Item | Summary | Rationale |
|------|---------|-----------|
| **`@commoners/audit`** | SBOM generation, multi-language dependency auditing | Compliance-ready for regulated apps (FDA, medical devices). See [security-whitepaper.md](./security-whitepaper.md) |
| **Auto-update validation** | End-to-end test with real GitHub Releases | Plugin rewritten but untested in production |
| **Platform abstractions** | `commoners.storage`, `commoners.notifications` across Electron + Web | Genuine value abstracting `electron-store`/fs vs `localStorage`/IndexedDB. See [platform-abstractions.md](./platform-abstractions.md) |

### Medium-term

| Item | Document | Status |
|------|----------|--------|
| [Testing + Distribution](./testing-and-distribution.md) | Mobile build output tests, native emulator testing | Protocol E2E and WASM E2E done |
| [Tauri Future Work](./tauri-future-work.md) | SEA cross-compilation, dev mode testing, IPC bridge, code signing | Core done; remaining is future work |

### Long-term (demand-driven)

| Item | Document | Notes |
|------|----------|-------|
| [Device Communication Abstraction](./device-communication-abstraction.md) | `commoners.bluetooth` / `commoners.serial` per-runtime adapters | Blocked by Tauri device plugin maturity |
| Tauri Mobile Backend | Offer Tauri mobile as Capacitor alternative | Waiting on `tauri-plugin-blec` 1.0+ |
| [Build Adapter Interface](./build-adapter-interface.md) | Pluggable frontend bundler | Phase 1 done. Phase 2-3 only if Vite creates breaking changes |

---

## Completed

Everything below is done and in the codebase.

### Release Gate (4/4)
CI test coverage. Windows ASAR hardening. Desktop test stability. Documentation.

### Post-1.0 Items
Vite 8.0.0 upgrade (Rolldown bundler). Auto-update plugin rewrite. ServiceHealthMonitor wired into service start() with 11 tests. Orphan process cleanup (PID file). Plugin runtime abstraction (`DesktopRuntime` in plugin context type). Multi-window testing.

### Tauri Desktop Backend
`DesktopRuntime` interface + Electron/Tauri implementations. Build/launch strategies for both runtimes. Sidecar lifecycle management. 104 Tauri-specific tests.

### Architecture Improvements (Batch D, 8/8)
Typed command registry, capabilities-driven IPC allowlist, plugin capability declarations, plugin hot reload, service health monitoring (class), window event bus, `commoners.is()` runtime detection, declarative service bundling.

### Security (P0/P1)
IPC channel validation with allowlists. ASAR integrity embedding (macOS + Windows). Binary hash verification for service executables. CSP with dynamic generation. Code signing integration. Secure Services plugin (per-session tokens). 77 security tests.

### Individual Items (29+)
Extensions unification. Electron IPC async migration (sendSync eliminated). Custom protocol handler. WASM service compilation (wasm-pack). macOS ASAR post-sign verification. Vite evolution audit. CargoService helper. Mobile workflow validation. Documentation overhaul. Dev output cleanup. Plugin dependency ordering. Capability querying (`commoners.query()`). Cross-window events (`@commoners/messaging`). Cross-platform icon handling.

### Reference Documents
- [Windows Verification Checklist](./windows-verification.md)
- [Sandbox Investigation](./sandbox-investigation.md)
- [Tauri Integration Reference](./tauri-integration-reference.md)
- [Security Whitepaper](./security-whitepaper.md) (P0/P1 complete)
- [Electron Coupling Audit](./electron-coupling-audit.md)
- [ASAR Integrity Hardening](./asar-hardening.md) (macOS complete)
- [Vite Evolution](./vite-evolution.md) (migration complete)

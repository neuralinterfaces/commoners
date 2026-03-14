# Feature Roadmap

## 1.0.0 Release Gate

These four items must be complete before shipping 1.0.0. Everything else is post-1.0.

| # | Item | Effort | What's Needed |
|---|------|--------|---------------|
| 1 | **CI test coverage** | Low (config only) | Add `test:fast-unit` script to `package.json`; add CI step running security (77), API (55), Tauri (104), protocol, ASAR, config-stripping, hooks, errors, formatting, plugin-lifecycle tests |
| 2 | **Windows ASAR hardening** | Half day | PowerShell verification script + `desktop-build.yml` CI step. macOS is done. See [asar-hardening.md](./asar-hardening.md) |
| 3 | **Desktop test stability** | Half day | Fix port 2345 contention causing flaky desktop start tests in full suite. Tests pass in isolation but fail when run after other files |
| 4 | **Documentation** | 1-2 days | VitePress docs for new APIs: `commoners.bus`, `commoners.api`, `commoners.query()`, health monitoring, plugin capabilities, hot reload, typed IPC, capabilities-driven allowlist |

---

## Implementation Plans

Detailed plans for all remaining items, organized by dependency. Each document follows: Problem → Current State → Implementation Plan → File Inventory → Dependencies → Verification → Risks/Tradeoffs.

### 1.0.0 Items (from table above)

| Document | Summary | Status |
|----------|---------|--------|
| [ASAR Integrity Hardening](./asar-hardening.md) | ~~macOS post-sign hash re-embedding~~; Windows `rcedit` verification, CI verification | In Progress (macOS done) |
| [Testing Gaps + Distribution](./testing-and-distribution.md) | CI coverage, protocol E2E, WASM E2E, mobile build output | Planned |

### Post-1.0 — Timing-Sensitive

| Document | Summary | Status |
|----------|---------|--------|
| [Vite Evolution](./vite-evolution.md) | Audit complete: 10 hooks, 6 config options, 2 esbuild calls. 1 critical item (`inlineDynamicImports`). Ready for Vite 8 beta testing | Audit done, awaiting Vite 8 |
| [Build Adapter Interface](./build-adapter-interface.md) | Pluggable frontend bundler (`BuildAdapter`) + service compiler (`ServiceBundler`). Phase 1 pairs with Vite 8 migration | Design phase |

### Post-1.0 — Design Phase (documented, not planned)

| Document | Summary | Status |
|----------|---------|--------|
| [Security Whitepaper](./security-whitepaper.md) | Threat model, security controls, proposed plugins (`@commoners/integrity`, `@commoners/secure-services`, `@commoners/audit`) | P0/P1 done (77 tests); P2/P3 plugins planned |
| [Platform Abstractions](./platform-abstractions.md) | Storage, Notification, Context, File System cross-platform adapters | Design phase |

### Post-1.0 — Long-Term

| Document | Summary | Status |
|----------|---------|--------|
| [Device Communication Abstraction](./device-communication-abstraction.md) | `commoners.bluetooth` / `commoners.serial` API, per-runtime adapters | Deferred — large scope, external plugin dependencies |
| Tauri Mobile Backend | Offer Tauri mobile as Capacitor alternative when ecosystem matures | Waiting on `tauri-plugin-blec` 1.0+ |
| [Tauri Future Work](./tauri-future-work.md) | SEA cross-compilation, Tauri dev mode integration test | Remaining after sidecar lifecycle |

---

<details>
<summary><strong>Completed</strong> (Batch B + Batch D + 29 individual items)</summary>

### Batch B — Tauri Desktop Backend (done)

`DesktopRuntime` abstraction, `createElectronRuntime()` + `createTauriRuntime()` adapters, `sendSync` elimination, sidecar lifecycle. 104 Tauri tests.

### Batch D — Architecture Improvements (8/8 done)

Typed command registry, capabilities-driven IPC allowlist, plugin capability declarations, plugin hot reload, service health monitoring, window event bus, unified async API, declarative service bundling.

### Individual Items

Extensions unification, Electron IPC async migration, custom protocol, WASM service compilation, macOS ASAR post-sign verification, Vite evolution audit, CargoService helper, mobile workflow validation, security whitepaper P0/P1, and 20 more.

</details>

### Reference Documents

- [Windows Verification Checklist](./windows-verification.md) — testing builds, signing, and known gaps on Windows
- [Sandbox Investigation](./sandbox-investigation.md) — `app.enableSandbox()` freezes Electron on Windows; per-window workaround
- [Tauri Integration Reference](./tauri-integration-reference.md) — sidecar system, code-signing, mobile plugin maturity, binary size

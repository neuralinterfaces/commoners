# Feature Roadmap

## Recent Progress

### Electron Testing Stability (completed)

Getting desktop tests to pass reliably required solving several interrelated problems. Key lessons:

**CDP page references are fragile.** Electron spawns multiple Chromium subprocesses (GPU, renderer, utility). When any crashes, the CDP page goes stale and Playwright calls throw. The old code did `pages()[0]` after a fixed 5s sleep — this could grab the splash screen page, and any subprocess crash killed the test run. Fix: poll for the page with the `commoners` global, and wrap the page in a recovery proxy that auto-finds a new page on `close`/`crash` events. Adding `--in-process-gpu` reduces subprocess count and crash surface.

**`beforeExit` fires mid-test.** The cleanup module registered handlers on `beforeExit`, which fires whenever the Node.js event loop is momentarily empty — including between async test steps. This killed Electron mid-test. Fix: skip exit event registration when `__COMMONERS_TESTING` is set; let the test's `afterAll` handle cleanup explicitly.

**SIGTERM doesn't kill process trees.** Electron's child processes sometimes ignore SIGTERM. Fix: `treeKillGracefully` sends SIGTERM, polls for 3s, then escalates to SIGKILL.

**`ipcMain.handle()` throws on duplicate registration.** With splash + main windows, `desktop.load` runs twice per channel. Fix: `scopedHandle()` calls `removeHandler` before `handle`.

**Vite watch mode breaks CDP.** File changes during tests triggered Vite rebuilds, which destroyed the renderer page. Fix: disable watch mode when `__COMMONERS_TESTING` is set.

**Remote debugging port must be a spawn argument.** Chromium reads CLI flags during initialization, before Electron's async plugin lifecycle runs. `app.commandLine.appendSwitch()` in a plugin `start()` hook is too late. Fix: pass `--remote-debugging-port` as a spawn argument to the Electron child process.

### Other Fixes (completed)

**WASM service resolution.** WASM services went through the full `resolveService()` path, which stripped their `__wasm` marker and treated them as network services ("Failed to launch service"). Fix: return early when `__wasm` or `type === 'wasm'` is set.

**Service build paths in dev mode.** `buildServices` resolved with `build: true` even in dev, placing compiled services in `.commoners/services/` while the Electron main process expected `.commoners/.tmp/services/`. Fix: use `build: !dev`.

**`__resolved` flag lost by object spread.** `{ ...resolvedConfig, outDir }` drops non-enumerable properties. `__resolved` was non-enumerable, so downstream `resolveConfig()` calls re-resolved with incompatible extensions format. Fix: re-attach via `Object.defineProperty`.

### Test Status

| Suite | Result | Notes |
|-------|--------|-------|
| Desktop (start + launch) | 18/18 pass | 3 consecutive stable runs |
| Desktop (Windows) | 14/14 pass | Required disabling `app.enableSandbox()` — see [Sandbox Investigation](./sandbox-investigation.md) |
| Start (web + mobile) | 32/32 pass | |
| API | 48/48 pass | |

**Known gaps:**
- Desktop build test (`registerBuildTest`) commented out — built app interferes with launch test when run sequentially. Needs isolated execution.
- Python services skip when PyInstaller unavailable (requires conda environment)
- Rust service echo takes ~32s (waitForService timeout)
- C++/Rust service echo tests require toolchains on PATH (auto-skipped if missing)

---

## Implementation Plans

Detailed implementation plans for all remaining roadmap items. Each document follows the template: Problem → Current State → Implementation Plan → File Inventory → Dependencies → Verification → Risks/Tradeoffs.

### Batch A — Independent (start now, parallel)

| Document | Summary | Status |
|----------|---------|--------|
| [ASAR Integrity Hardening](./asar-hardening.md) | Fix macOS post-signing hash, make `rcedit` primary on Windows, sandbox testing, CI verification | Planned |
| [Testing Gaps + Distribution](./testing-and-distribution.md) | Protocol E2E, WASM E2E, mobile build output, native emulators, app store CI/CD | Planned |
| [Security Whitepaper](./security-whitepaper.md) | Threat model, Commoners-unique risks, security controls, security testing, proposed plugins | Planned |

### Batch B — Sequential dependency chain

| Document | Summary | Depends On | Status |
|----------|---------|-----------|--------|
| [Runtime Abstraction Completion](./runtime-abstraction-completion.md) | Route all Electron API calls through `DesktopRuntime`, plugin context wrapping, protocol sub-routes | — | Done (Phase 3) |
| [Tauri Desktop Backend](./tauri-desktop-backend.md) | `TauriBuildStrategy`, `tauri.conf.json` auto-generation, `createTauriRuntime()`, sidecar service lifecycle | Runtime abstraction | Planned |
| [Device Communication Abstraction](./device-communication-abstraction.md) | `commoners.bluetooth` / `commoners.serial` API, per-runtime adapters, C++ WASM via Emscripten | Tauri backend | Planned |

### Batch C — Independent (timing-sensitive)

| Document | Summary | Status |
|----------|---------|--------|
| [Vite Evolution](./vite-evolution.md) | Audit 8 Rollup hooks + 3 esbuild usages for Rolldown compat, evaluate plugin refactor | Planned (track Vite 8 release) |

### Batch D — Tauri-Inspired Deep Integration (parallel, after Batch B)

Cross-cutting architecture improvements inspired by Tauri's design patterns. Benefits all backends (Electron, Tauri, web). Tracked in [Tauri Future Work § Deep Integration](./tauri-future-work.md#deep-integration-tauri-inspired-architecture-improvements).

| Item | Summary | Priority | Effort |
|------|---------|----------|--------|
| ~~Typed Command Registry~~ | ~~Replace string IPC channels with typed command interface~~ | High | Done |
| ~~Capabilities-Driven IPC~~ | ~~Declarative IPC allowlist from config (mirrors Tauri capabilities)~~ | High | Done |
| ~~Plugin Capability Declaration~~ | ~~Plugins declare provides/requires/platforms upfront~~ | Medium | Done |
| Plugin Hot Reload | Dev-mode plugin reload via unload() hook + file watching | Medium | Medium |
| Service Health Monitoring | Heartbeat, auto-restart, health events | Medium | Medium |
| Window Event Bus | Cross-window broadcast + state persistence | Medium | Low |
| Unified Async API | Async-first runtime API, eliminate sync/async ambiguity | Medium | Medium |
| Declarative Service Bundling | Service manifest for build-time inclusion | Low | Low |

### Dependency Graph

```
Batch A (start now, parallel)
  asar-hardening.md ─────────────────── No prerequisites
  testing-and-distribution.md ───────── No prerequisites
  security-whitepaper.md ────────────── No prerequisites

Batch B (sequential)
  runtime-abstraction-completion.md ─── No prerequisites (Phase 1 started)
      │
      ▼
  tauri-desktop-backend.md ──────────── Requires: runtime abstraction complete
      │
      ▼
  device-communication-abstraction.md ─ Requires: Tauri backend functional

Batch C (independent, timing-sensitive)
  vite-evolution.md ─────────────────── Track Vite 8 release

Batch D (after Batch B, parallel)
  Typed Command Registry ──────────────── DONE
  Capabilities-Driven IPC ─────────────── DONE
  Plugin Capability Declaration ────────── DONE
  Plugin Hot Reload ────────────────────── Unblocked (Plugin Capability Declaration done)
  Service Health Monitoring ────────────── Unblocked (no prerequisites)
  Window Event Bus ─────────────────────── Unblocked (runtime abstraction done)
  Unified Async API ────────────────────── Unblocked (Typed Command Registry done)
  Declarative Service Bundling ─────────── Unblocked (no prerequisites)
```

### Reference Documents

These existing documents provide technical analysis referenced by the implementation plans:

- [Windows Verification Checklist](./windows-verification.md) — single-page handoff for testing builds, signing, and known gaps on Windows
- [Sandbox Investigation](./sandbox-investigation.md) — `app.enableSandbox()` freezes Electron on Windows; currently using per-window sandbox workaround
- [Electron Coupling Audit](./electron-coupling-audit.md) — catalogs all Electron integration points (~2,000-2,500 lines), abstraction quality assessment, migration effort estimate
- [Tauri Integration Reference](./tauri-integration-reference.md) — sidecar system, code-signing issues, mobile plugin maturity comparison, binary size analysis

---

## Long-Term

### Phase 4: Tauri Mobile Backend

When Tauri's mobile plugin ecosystem matures — especially BLE (currently 1 maintainer, pre-1.0, with known Android connectivity issues vs Capacitor's 28 contributors and stable v8.x) — offer Tauri mobile as an alternative to Capacitor for mobile builds. Consumer code unchanged because it goes through Commoners' abstraction layers. See [Tauri Integration Reference](./tauri-integration-reference.md) for detailed ecosystem comparison.

Milestones to watch:
- `tauri-plugin-blec` reaching 1.0 with working service discovery and multi-device support
- More than 1 maintainer on critical device plugins
- At least one documented production app using Tauri mobile + BLE in an app store
- A WebUSB equivalent appearing in the Tauri plugin ecosystem

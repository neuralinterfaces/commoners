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
| Start (web + mobile) | 32/32 pass | |
| API | 48/48 pass | |

**Known gaps:**
- Desktop build test (`registerBuildTest`) commented out — built app interferes with launch test when run sequentially. Needs isolated execution.
- Python services skip when PyInstaller unavailable (requires conda environment)
- Rust service echo takes ~32s (waitForService timeout)

## Desktop Runtime Abstraction

The long-term goal is to make the desktop runtime (Electron, Tauri) a **swappable implementation detail** that consumers don't need to think about. See [/critique.md](/critique.md) (Sections 6-8) for the full strategic analysis behind this roadmap.

### Phase 1: Runtime Interface Isolation (in progress)
- Define a `DesktopRuntime` interface that formalizes the existing compartmentalization between Electron-specific code (`packages/core/assets/electron/`) and target-agnostic code
- Abstract IPC into a runtime-agnostic `send()` / `on()` / `invoke()` contract — **async `invoke`/`handle` migration completed** as prerequisite
- Ensure service orchestration layer has no direct Electron imports

### Phase 2: Tauri Desktop Backend
- Create `packages/core/assets/tauri/` mirroring the Electron module structure (main, IPC, window, plugins, lifecycle)
- Implement `TauriBuildStrategy` and `TauriLaunchStrategy` alongside existing Electron strategies
- Auto-generate `tauri.conf.json` (including `externalBin` for services) from `commoners.config.ts`
- Adapt service lifecycle management to use Tauri's `@tauri-apps/plugin-shell` sidecar API
- Handle differences: no `fork()` for JS services (use HTTP/stdin-stdout), PyInstaller orphan process workaround, sidecar code-signing automation

**Why not just replace Electron?** Electron remains the only desktop runtime where `navigator.bluetooth`, `navigator.serial`, `navigator.usb`, and `navigator.hid` work on macOS and Linux. Apple and Mozilla have explicitly refused to implement these APIs. Tauri's system webview does not have them on 2 of 3 desktop platforms. For apps that use device communication via Web APIs, Electron is still required. For apps that don't, Tauri offers smaller binaries (~4MB vs ~100MB base, though the gap narrows significantly once backend services are bundled).

### Phase 3: Device Communication Abstraction
- Introduce Commoners-level device APIs (`commoners.bluetooth`, `commoners.serial`, etc.) that abstract the underlying runtime
- On Electron: delegates to `navigator.bluetooth` + Electron's permission/selection bridge (current behavior)
- On Tauri: delegates to Rust-based plugins (`tauri-plugin-blec`, `tauri-plugin-serialplugin`) via `invoke()`
- On Web (Chrome): delegates to `navigator.bluetooth` / `navigator.serial`
- On Mobile: delegates to Capacitor plugins or Tauri mobile plugins depending on the runtime
- The existing device selection modal (Web Component) works identically across all runtimes

**Why this matters**: Today, consumers call `navigator.bluetooth.requestDevice()` directly. This works in Chrome and Electron but does not exist in Tauri's webview on macOS/Linux. A Commoners-level abstraction makes consumer device code portable across ALL runtimes without changes -- enabling transparent Electron-to-Tauri migration even for hardware apps.

### Phase 4: Tauri Mobile Backend (longer term)
- When Tauri's mobile plugin ecosystem matures (especially BLE -- currently 1 maintainer, pre-1.0, with known Android connectivity issues vs Capacitor's 28 contributors and stable v8.x)
- Offer Tauri mobile as an alternative to Capacitor for mobile builds
- Consumer code unchanged because it goes through Commoners' abstraction layers

## Mobile
1. Automated mobile build system for [iOS](https://github.com/dulvui/godot-ios-upload) and [Android](https://github.com/dulvui/godot-android-export0) on GitHub Actions.

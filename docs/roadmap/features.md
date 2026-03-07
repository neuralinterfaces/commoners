# Feature Roadmap

## Desktop Runtime Abstraction

The long-term goal is to make the desktop runtime (Electron, Tauri) a **swappable implementation detail** that consumers don't need to think about. See [/critique.md](/critique.md) (Sections 6-8) for the full strategic analysis behind this roadmap.

### Phase 1: Runtime Interface Isolation
- Define a `DesktopRuntime` interface that formalizes the existing compartmentalization between Electron-specific code (`packages/core/assets/electron/`) and target-agnostic code
- Abstract IPC into a runtime-agnostic `send()` / `on()` / `invoke()` contract
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

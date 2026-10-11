# Tauri Integration Reference

Technical reference for [Phases 2-4 of the Tauri integration roadmap](./features.md). This document covers the Tauri sidecar system, code-signing challenges, mobile plugin maturity, and developer experience comparison with Capacitor.

---

## 1. Tauri Sidecar System (Service Bundling)

Commoners' multi-language service orchestration needs to bundle arbitrary backend binaries (Python executables, compiled C++ servers, Node.js SEAs, Rust binaries) alongside the desktop application. Tauri's sidecar system supports this.

### How it works

- Binaries are placed in `src-tauri/binaries/` and must follow a **target-triple naming convention**:
  - `my-service-x86_64-apple-darwin` (macOS Intel)
  - `my-service-aarch64-apple-darwin` (macOS Apple Silicon)
  - `my-service-x86_64-unknown-linux-gnu` (Linux)
  - `my-service-x86_64-pc-windows-msvc.exe` (Windows)
- Determine the correct triple via `rustc --print host-tuple` (Rust 1.84.0+)
- At build time, Tauri bundles the correct platform-specific binary
- At runtime, the binary is spawned as a separate OS process

### Configuration

In `tauri.conf.json`:
```json
{
  "bundle": {
    "externalBin": [
      "binaries/python-api-server",
      "binaries/cpp-compute-engine",
      "binaries/node-websocket-bridge"
    ]
  }
}
```

Permissions in `src-tauri/capabilities/default.json`:
```json
{
  "identifier": "default",
  "permissions": [
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        {
          "name": "binaries/python-api-server",
          "sidecar": true,
          "args": [{ "validator": "\\S+" }]
        }
      ]
    }
  ]
}
```

**Commoners integration:** The build pipeline would auto-generate both the `externalBin` array and the capability permissions from `commoners.config.ts` service declarations. The target-triple naming convention can be automated using `rustc --print host-tuple` during the build.

### Multiple sidecars

Fully supported. No documented upper limit on the number of entries in `externalBin`. Each sidecar is spawned independently:

```javascript
import { Command } from '@tauri-apps/plugin-shell';

const python = await Command.sidecar('binaries/python-api-server', ['--port', '8001']).spawn();
const cpp = await Command.sidecar('binaries/cpp-compute-engine', ['--port', '8002']).spawn();
```

### JavaScript lifecycle API

The `@tauri-apps/plugin-shell` package provides:

```javascript
const command = Command.sidecar('binaries/my-service', ['--port', '8080']);

// Event streams
command.stdout.on('data', (line) => console.log('stdout:', line));
command.stderr.on('data', (line) => console.error('stderr:', line));
command.on('close', (data) => console.log('exited with', data.code));
command.on('error', (error) => console.error('error:', error));

// Spawn and manage
const child = await command.spawn();
console.log('PID:', child.pid);
await child.write('some input\n');  // stdin
await child.kill();                  // terminate
```

### Comparison to Electron's extraResources

| Feature | Tauri Sidecar | Electron extraResources |
|---------|--------------|------------------------|
| Configuration | `externalBin` in `tauri.conf.json` | `extraResources` in `electron-builder.yml` |
| Binary naming | Must follow target-triple convention | No naming convention required |
| Security model | Granular permissions with arg validators | No built-in restrictions |
| JS API | `Command.sidecar()` with spawn/kill | Manual `child_process.spawn()` |
| IPC options | stdin/stdout, HTTP, local sockets | Node.js IPC, stdin/stdout, HTTP, sockets |
| Code signing | Auto-attempted but problematic (see below) | Handled by electron-builder, more mature |
| `fork()` support | No (no Node.js in main process) | Yes, with built-in IPC channel |

---

## 2. Known Issues and Limitations

### Code Signing on macOS

Tauri attempts to code-sign sidecar binaries during the macOS build, but notarization frequently fails:

- **Issue [#11992](https://github.com/tauri-apps/tauri/issues/11992):** Notarization fails with "The signature of the binary is invalid" or "nested code is modified or invalid" even when the app notarizes successfully without `externalBin`.
- **Workarounds:**
  1. Set Developer ID certificates to "Always Trust" in Keychain
  2. Pre-sign binaries manually: `codesign -f --timestamp --sign "Developer ID" --options runtime --keychain $HOME/Library/Keychains/login.keychain-db [binary]`
  3. Use `--deep` flag when pre-signing
- **Dynamic libraries** (`.dylib`) used as resources are NOT auto-signed through `externalBin`. [Discussion #12001](https://github.com/tauri-apps/tauri/discussions/12001) received no official Tauri team response.

**Commoners integration:** The build pipeline would need to handle pre-signing of sidecar binaries before invoking `tauri build`. This is comparable to what Commoners already does with `sign: true` in asset metadata.

### PyInstaller Orphan Process Bug

PyInstaller one-file executables create a bootloader parent process. Tauri's `child.kill()` only kills one of the two processes, leaving orphans. [Issue #11686](https://github.com/tauri-apps/tauri/issues/11686) -- closed as "not planned."

**Workarounds:**
- Use PyInstaller `--onedir` instead of `--onefile`
- Use `taskkill /PID /T` on Windows, `pkill -P` on macOS/Linux
- Implement Python-side self-termination when parent dies (check `os.getppid()`)

**Commoners impact:** Commoners already recommends `--onedir` for PyInstaller in the service docs, so this is manageable.

### Missing Lifecycle Management

A [feature request for a Sidecar Lifecycle Management Plugin](https://github.com/tauri-apps/plugins-workspace/issues/3062) documents what Tauri's shell plugin lacks:

- No health checks (HTTP, TCP, or custom)
- No automatic restart with backoff strategies
- No graceful shutdown with SIGTERM/SIGKILL timeout chains
- No port management or conflict resolution
- No orphan process cleanup

**Commoners impact:** This is exactly what Commoners' service orchestration layer already provides (`packages/core/assets/services/`). The service system handles spawning, monitoring stdout/stderr, tracking process state, port assignment, and cleanup. This layer is the value-add on top of Tauri's raw sidecar support.

### No `fork()` Equivalent

Commoners uses Node.js `fork()` for JavaScript services, which provides a built-in IPC channel. Tauri has no Node.js in the main process.

**Workaround:** JS services must be compiled to SEA/pkg binaries and communicate over HTTP or stdin/stdout. Commoners' build system already handles SEA compilation. The URL-based service communication pattern (`service.url`) that Commoners already uses is compatible with this approach.

---

## 3. Binary Size Impact

| Configuration | Approximate Size |
|---|---|
| Bare Tauri app (no sidecars) | ~2-10 MB |
| Bare Electron app (no extras) | ~60-150 MB |
| Tauri + Node.js sidecar (via pkg) | ~63 MB |
| Electron + Node.js backend | ~205 MB |
| PyInstaller one-dir bundle | ~30-80 MB (varies by dependencies) |
| Compiled C++ binary | ~1-20 MB |
| Compiled Rust binary | ~1-20 MB |

**With multiple sidecars** (Python + Node + C++): Tauri reaches ~80-150 MB vs Electron's ~170-250 MB. A meaningful ~2x difference, but far from the 25x that bare comparisons suggest.

---

## 4. Mobile Plugin Comparison: BLE

The most critical device plugin for Commoners' target audience.

### Head-to-Head: `tauri-plugin-blec` vs `@capacitor-community/bluetooth-le`

| Dimension | `tauri-plugin-blec` | `@capacitor-community/bluetooth-le` |
|-----------|---------------------|--------------------------------------|
| **GitHub stars** | ~215 | ~351 |
| **Contributors** | 1 (MnlPhlp) | 28 |
| **Total downloads** | ~21,739 all-time (crates.io) | ~13,000+ weekly (npm) |
| **Version** | 0.5.3 (pre-1.0) | 8.1.0 (stable) |
| **Languages** | Rust 63%, Kotlin 31%, TS 6% | Swift, Kotlin, TypeScript |
| **Bus factor** | 1 | ~5-8 active contributors |

### API Completeness

| Feature | tauri-plugin-blec | capacitor bluetooth-le |
|---------|-------------------|----------------------|
| Scanning | Yes | Yes |
| Connecting | Yes (issues on some Android devices) | Yes |
| Read characteristics | Limited | Yes |
| Write characteristics | Yes (`sendString`, `send_data`) | Yes (`write`, `writeWithoutResponse`) |
| Notifications | Unclear/limited | Yes (`startNotifications`, `stopNotifications`) |
| Service discovery | **Broken** (issue #46: returns empty) | Yes (`discoverServices`) |
| Bonding | No | Yes (Android explicit, iOS OS-managed) |
| Multi-device | No (issue #34: requested) | Yes |
| RSSI reading | No | Yes |
| MTU negotiation | No | Yes |
| Descriptor access | No | Yes |
| Connection priority | No | Yes |

### Known Bugs in tauri-plugin-blec

- **Issue #46:** Service discovery returns empty objects
- **Issue #42:** Android connection failures on Huawei devices
- **Issue #17:** Android connection failures on Redmi devices
- **Issue with thermal printers:** Promise hangs indefinitely

### iOS Support

- **tauri-plugin-blec:** Uses btleplug's CoreBluetooth FFI through Rust. Documented as "should just work." Zero open iOS-specific issues (likely indicating low iOS usage rather than stability).
- **Capacitor BLE:** Direct Swift implementation using CoreBluetooth. Thousands of production apps. iOS-specific edge cases regularly addressed by community.

### Production Evidence

- **tauri-plugin-blec:** Zero documented production apps in app stores using Tauri + BLE. One personal blood pressure tracker found.
- **Capacitor BLE:** Hundreds of production apps including medical devices, fitness trackers, e-scooter diagnostics (Egret & Norsk), BLE beacon management tools.

---

## 5. Mobile Plugin Comparison: Serial

### Does serial make sense on mobile?

Only on Android via USB OTG. Realistic scenarios:
- Arduino/microcontroller via USB OTG cable to Android phone
- USB-to-serial adapters for industrial equipment
- BLE dongles connected as USB serial devices

iOS serial is a dead end for both frameworks due to Apple's MFi program restrictions.

### Available Plugins

| Plugin | Framework | Android USB OTG | iOS |
|--------|-----------|----------------|-----|
| `tauri-plugin-serialplugin` | Tauri | Yes (via JitPack) | No |
| `@mkopa/capacitor-serialport` | Capacitor | Yes (FTDI, PL2303, CP210X) | No |
| `@adeunis/capacitor-serial` | Capacitor | Yes | No |
| `capacitor-usb-serial` | Capacitor | Yes | No |

---

## 6. Developer Experience: Writing a Mobile Plugin

### Tauri Plugin Development

You write code in **four languages** (Rust, Kotlin, Swift, TypeScript):

1. Scaffold: `tauri plugin new my-plugin`
2. Rust: `src/lib.rs`, `src/mobile.rs`, `src/desktop.rs` -- command interface and dispatch
3. Kotlin: `android/src/main/kotlin/` -- `@TauriPlugin` + `@Command` annotations
4. Swift: `ios/Sources/` -- `Plugin` subclass with `@objc` methods
5. TypeScript: JS bindings

The JS-to-native bridge is a **three-hop** path: JS → Rust → Native (Swift/Kotlin). Arguments are serialized to JSON at each boundary.

**Android caveat:** Native commands execute on the main thread by default. Long-running operations (BLE scanning) require manual `Dispatchers.IO` dispatch.

**Debugging:** [Open issue](https://github.com/tauri-apps/plugins-workspace/issues/2244) asking "How to debug a Tauri plugin on iOS or Android?" The debugging workflow is not well-documented.

### Capacitor Plugin Development

You write code in **three languages** (TypeScript, Swift, Kotlin):

1. Scaffold: `npm init @capacitor/plugin`
2. Swift: `CAPPlugin` subclass with `@objc` methods accepting `CAPPluginCall`
3. Kotlin: `Plugin` subclass with `@PluginMethod` annotations
4. TypeScript: JS bindings

The bridge is a **two-hop** path: JS → Native (Swift/Kotlin). Standard iOS/Android development patterns.

**Debugging:** Standard Xcode/Android Studio workflow. Set breakpoints in Swift with LLDB, use Logcat in Android Studio, profile with Instruments. Chrome DevTools for the web layer. Well-documented with years of community knowledge.

### Build/Test Cycle

| Factor | Tauri | Capacitor |
|--------|-------|-----------|
| Bottleneck | Rust compilation times | None (standard native build) |
| Hot reload (web) | Yes | Yes |
| Native changes | Requires Rust recompilation | Immediate in IDE |
| IDE integration | `tauri ios dev --open` / `tauri android dev --open` | `npx cap open ios` / `npx cap open android` |

---

## 7. Ecosystem Maturity (Numbers)

| Metric | Tauri v2 | Capacitor |
|--------|----------|-----------|
| Official plugins | ~31 (7 mobile-capable) | ~20 official + 100+ from Capawesome |
| Community plugins | ~70 (12 mobile-capable) | 63 in capacitor-community org + hundreds third-party |
| Total mobile-capable plugins | ~19 | Hundreds |
| Years of mobile support | ~1.5 (stable Oct 2024) | ~6 (since 2019) |
| Published app store apps | Unknown (likely dozens to low hundreds) | ~150,000 (Ionic/Capacitor ecosystem) |
| Active BLE plugin contributors | 1-2 | 28+ |

---

## 8. Implications for Commoners

### Phase 2 (Tauri Desktop Backend): Feasible Now

The sidecar system maps well to Commoners' service model. The main work is:
- Auto-generating `tauri.conf.json` with `externalBin` entries from `commoners.config.ts`
- Adapting service lifecycle management to use `@tauri-apps/plugin-shell`
- Handling code-signing for sidecar binaries (pre-sign before `tauri build`)
- Working around PyInstaller orphan bug (recommend `--onedir`)
- Implementing graceful shutdown and health checks (Commoners already has this logic)

### Phase 3 (Device Abstraction): Requires Careful API Design

The device abstraction layer must account for fundamental API differences:
- Electron: Intercepts standard Web APIs with custom permission/selection UX
- Tauri: Completely replaces Web APIs with Rust plugin invocations
- Web: Uses standard Web APIs directly (Chrome only)
- Capacitor Mobile: Uses Capacitor plugin API
- Tauri Mobile: Uses Tauri mobile plugin API

The abstraction should expose a Commoners-specific API (e.g., `commoners.bluetooth.requestDevice()`) that delegates to the appropriate runtime. The existing device selection modal (Web Component with Shadow DOM, supports light/dark mode) can be reused across all runtimes.

### Phase 4 (Tauri Mobile Backend): Wait for Ecosystem Maturity

The Tauri mobile plugin ecosystem for device communication is not ready for production. Specific milestones to watch:
- `tauri-plugin-blec` reaching 1.0 with working service discovery and multi-device support
- More than 1 maintainer on critical device plugins
- At least one documented production app using Tauri mobile + BLE in an app store
- A WebUSB equivalent appearing in the Tauri plugin ecosystem

Estimated timeline: 1-3 years based on current trajectory.

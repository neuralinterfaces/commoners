# Device Communication Abstraction (Phase 3) + C++ WASM

Implementation plan for runtime-portable device APIs and C++ WASM compilation via Emscripten.

**Prerequisites:** Tauri Desktop Backend (completed) must be functional (device abstraction needs multiple runtimes to abstract over).

---

## Problem

### Device APIs

Today, Commoners consumers call `navigator.bluetooth.requestDevice()` and `navigator.serial.requestPort()` directly. This works in Chrome and Electron but:

- **Tauri (macOS/Linux):** WebView doesn't expose Web Bluetooth or Web Serial (Apple and Mozilla refuse to implement)
- **Tauri (Windows):** Edge WebView2 supports Web Bluetooth but not Web Serial
- **Mobile (Capacitor):** Uses Capacitor plugins with a completely different API
- **Mobile (Tauri):** Uses Tauri mobile plugins with yet another API

Without an abstraction layer, consumer code is locked to a specific runtime. A `commoners.bluetooth` / `commoners.serial` API makes device code portable across all runtimes.

### C++ WASM

Rust WASM compilation is implemented via `WasmCargoService`. C++ services have no equivalent WASM path. Emscripten can compile C/C++ to WASM, enabling browser-based execution of C++ services.

---

## Current State

### Device Plugins

| Plugin | Location | Current Backend |
|--------|----------|-----------------|
| BLE | `packages/plugins/devices/ble/index.ts` | `navigator.bluetooth` + Electron `select-bluetooth-device` event |
| Serial | `packages/plugins/devices/serial/index.ts` | `navigator.serial` + Electron `select-serial-port` event |

**Shared infrastructure:**
- Device selection modal (Web Component with Shadow DOM): `packages/plugins/devices/modal.ts`
- CSS custom properties with `prefers-color-scheme` dark mode
- `isSupported` mechanism for platform-specific gating

### WASM Services

| Class | Language | Location | Status |
|-------|----------|----------|--------|
| `WasmCargoService` | Rust | `packages/core/services/wasm.ts` | Complete |
| `EmscriptenService` | C++ | — | Not started |

---

## Implementation Plan: Device Abstraction

### Step 1: Define `commoners.bluetooth` API

**Goal:** A runtime-agnostic API surface for BLE operations.

```typescript
interface CommonersBluetooth {
  requestDevice(options?: BluetoothRequestDeviceOptions): Promise<CommonersBluetoothDevice>
  getDevices(): Promise<CommonersBluetoothDevice[]>
}

interface CommonersBluetoothDevice {
  id: string
  name: string | undefined
  gatt: CommonersBluetoothGATT
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

interface CommonersBluetoothGATT {
  connect(): Promise<CommonersBluetoothGATT>
  disconnect(): void
  connected: boolean
  getPrimaryService(service: string): Promise<CommonersBluetoothService>
  getPrimaryServices(service?: string): Promise<CommonersBluetoothService[]>
}

// ... Service, Characteristic, Descriptor follow Web Bluetooth API shape
```

**Design principle:** Mirror the Web Bluetooth API shape so migration from `navigator.bluetooth` is minimal. Where Tauri/Capacitor backends diverge, normalize to the Web Bluetooth behavior.

### Step 2: Implement Runtime Backends

| Runtime | Backend | Notes |
|---------|---------|-------|
| **Electron** | `navigator.bluetooth` + permission/selection bridge | Current behavior, wrap into adapter |
| **Tauri (Windows)** | Edge WebView2 `navigator.bluetooth` | Works natively in WebView2 |
| **Tauri (macOS/Linux)** | `tauri-plugin-blec` via `invoke()` | Rust FFI to CoreBluetooth/BlueZ |
| **Web (Chrome)** | `navigator.bluetooth` directly | Pass-through adapter |
| **Capacitor (iOS)** | `@capacitor-community/bluetooth-le` | Stable, 28+ contributors |
| **Capacitor (Android)** | `@capacitor-community/bluetooth-le` | Stable |

**Implementation:**
1. Create `packages/plugins/devices/ble/adapters/` directory
2. One adapter per runtime: `electron.ts`, `tauri.ts`, `web.ts`, `capacitor.ts`
3. Runtime detection at initialization: check `commoners.DESKTOP`, `commoners.MOBILE`, `commoners.TARGET`
4. Adapter selection is automatic — consumer code just calls `commoners.bluetooth.*`

### Step 3: Define `commoners.serial` API

**Same pattern as bluetooth:**

```typescript
interface CommonersSerial {
  requestPort(options?: SerialPortRequestOptions): Promise<CommonersSerialPort>
  getPorts(): Promise<CommonersSerialPort[]>
}

interface CommonersSerialPort {
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  getInfo(): SerialPortInfo
}
```

| Runtime | Backend | Notes |
|---------|---------|-------|
| **Electron** | `navigator.serial` + `session.on('select-serial-port')` | Current behavior |
| **Tauri** | `tauri-plugin-serialplugin` via `invoke()` | Android USB OTG only for mobile |
| **Web (Chrome)** | `navigator.serial` directly | Pass-through |
| **Capacitor (Android)** | `@mkopa/capacitor-serialport` | USB OTG via FTDI/PL2303/CP210X |
| **iOS** | Not supported | Apple MFi restriction; documented in plugin source |

### Step 4: Modal Reuse Across Runtimes

**Goal:** The existing device selection modal works across all runtimes.

The modal is already a Web Component with Shadow DOM — it renders in any WebView. Adaptation needed:

1. **Electron:** Modal is triggered by Electron's device selection events (current behavior)
2. **Tauri:** Modal is triggered by the Commoners adapter when `requestDevice()` / `requestPort()` is called — the adapter performs scanning, populates the modal, and returns the user's selection
3. **Web:** Browser's native picker is used (no modal needed)
4. **Capacitor:** Modal is triggered by the Commoners adapter (similar to Tauri pattern)

**Files:** `packages/plugins/devices/modal.ts` (extend for adapter-driven triggering)

### Step 5: Testing

1. Unit tests for each adapter (mock runtime APIs)
2. Integration tests in Electron (BLE + Serial with device mocks)
3. Manual testing matrix across runtimes (document in test plan)

---

## Implementation Plan: C++ WASM via Emscripten

### Step 1: `EmscriptenService` Class

**Goal:** Mirror `WasmCargoService` for C++ services.

```typescript
class EmscriptenService {
  __wasm = true as const
  src: string        // Path to C++ source or CMakeLists.txt
  capabilities: ExtensionCapabilities

  constructor(src: string, options?: EmscriptenServiceOptions) { ... }

  build(): { command: string, args: string[] } {
    // Returns emcc invocation:
    // emcc src.cpp -o output.js -s WASM=1 -s EXPORTED_FUNCTIONS=[...] -s MODULARIZE=1
    // Or for CMake projects: emcmake cmake + emmake make
  }
}
```

**Options:**
- `exportedFunctions`: Functions to export from WASM module
- `flags`: Additional Emscripten compiler flags
- `cmake`: Boolean — use CMake build system instead of direct `emcc`

### Step 2: Build Integration

1. Detect `.cpp`, `.c`, `.cc` source files → use `EmscriptenService`
2. Build produces `.wasm` + `.js` glue code (like `wasm-pack` for Rust)
3. Reuse the existing WASM resolution path: `__wasm: true` flag, `sanitize()` sets `type: 'wasm'`
4. Same virtual module pattern: `commoners:wasm` helpers work for C++ WASM too

**Files:**
- `packages/core/services/emscripten.ts` (new)
- `packages/core/services/wasm.ts` (extend to support Emscripten output format)

### Step 3: Loader Adaptation

The `loadWasmService()` helper from `commoners:wasm` needs to handle both formats:

| Format | Rust (wasm-pack) | C++ (Emscripten) |
|--------|-------------------|-------------------|
| Output | `.wasm` + `.js` (ES module) | `.wasm` + `.js` (Module factory) |
| Loading | `import()` the JS, which loads WASM | Call Module factory, which loads WASM |
| Exports | Named exports from JS module | `Module.cwrap()` or `Module._funcName()` |

**Files:**
- `packages/core/vite/plugins/commoners.ts` (extend `commoners:wasm` virtual module)

### Step 4: Demo + Documentation

1. Add a C++ WASM demo service in `examples/demo/src/services/cpp-wasm/`
2. Document in `docs/guide/services/cpp.md` (if exists) or create new page
3. Show both direct `emcc` and CMake-based workflows

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `packages/plugins/devices/ble/adapters/` | Create | Per-runtime BLE adapters |
| `packages/plugins/devices/serial/adapters/` | Create | Per-runtime Serial adapters |
| `packages/plugins/devices/ble/index.ts` | Modify | Wire up adapter selection |
| `packages/plugins/devices/serial/index.ts` | Modify | Wire up adapter selection |
| `packages/plugins/devices/modal.ts` | Modify | Support adapter-driven triggering |
| `packages/core/services/emscripten.ts` | Create | `EmscriptenService` class |
| `packages/core/services/wasm.ts` | Modify | Support Emscripten output format |
| `packages/core/vite/plugins/commoners.ts` | Modify | Extend `commoners:wasm` for C++ |

---

## Dependencies

- **Requires:** Tauri Desktop Backend (completed) — multiple runtimes to abstract over
- **NPM deps (device):** `tauri-plugin-blec` (Tauri BLE), `tauri-plugin-serialplugin` (Tauri Serial), `@capacitor-community/bluetooth-le` (Capacitor BLE)
- **System deps (C++ WASM):** Emscripten SDK (`emsdk`), `emcc` compiler
- **Blocks:** Nothing directly (Phase 4 is longer-term)

---

## Verification

- [ ] `commoners.bluetooth.requestDevice()` works on Electron, Tauri (Windows), and Web (Chrome)
- [ ] `commoners.serial.requestPort()` works on Electron and Web (Chrome)
- [ ] Device selection modal appears correctly in Tauri (adapter-driven)
- [ ] `EmscriptenService` builds C++ to `.wasm` + `.js`
- [ ] `loadWasmService()` loads both Rust and C++ WASM modules
- [ ] `commoners.query({ runtime: 'wasm' })` returns C++ WASM services

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| `tauri-plugin-blec` is pre-1.0 with 1 maintainer | Document limitations; Electron remains default for BLE-heavy apps |
| Service discovery broken in `tauri-plugin-blec` (issue #46) | Monitor issue; fall back to manual UUID specification |
| Emscripten SDK is large (~1GB) | Optional dependency; document installation; gate CI tests |
| C++ WASM exports require manual `cwrap()` declarations | Provide helper utilities; document patterns |
| Multiple adapter implementations increase maintenance | Share as much code as possible (modal, data types); test adapters independently |
| Web Bluetooth/Serial availability varies by browser | `isSupported` mechanism already handles this; document browser matrix |

# Platform Enhancement

## The Problem: Cross-Platform Capability Tension

Building applications that work across web, desktop, and mobile means navigating a fundamental tension: each platform offers different capabilities. Desktop apps can spawn child processes and access the file system. Mobile apps have native Bluetooth and sensor APIs. Web apps run everywhere but have strict sandboxing.

Most frameworks ask you to choose: either target the lowest common denominator, or write separate codebases for each platform. Commoners takes a different approach.

## Three Strategies

### Progressive Enhancement

Start with a baseline experience that works everywhere, then add capabilities based on what the platform supports.

> "Start with the basics. Add power where available."

**Example:** A data visualization app works in any browser. On desktop, it can also spawn a Python service for real-time data processing. The web version fetches pre-computed results from a remote API instead.

### Graceful Degradation

Build the full-featured version first, then ensure the application remains functional when capabilities are absent.

> "Build the best version. Degrade gracefully."

**Example:** A BLE device manager uses `navigator.bluetooth` on the web. On mobile, it falls back to Capacitor's BLE plugin. If Bluetooth is completely unavailable, the UI shows a clear message instead of crashing.

### Platform Enhancement

The synthesis of both approaches: use the `commoners` global to detect the current platform and activate the right features for that context.

> "Know your platform. Enhance accordingly."

This is what commoners implements. Every application has access to platform detection flags and the ability to conditionally activate features.

## How Commoners Implements This

### Plugin `isSupported`

Every plugin declares where it works:

```ts
export const isSupported = {
  capacitor: capacitorConfiguration,  // Mobile-specific setup
  load: ({ WEB, MOBILE, DESKTOP }) => {
    if (WEB) return 'bluetooth' in navigator
    if (MOBILE) return true  // Capacitor handles it
    // Desktop: handled by Electron events
  },
}
```

The framework checks `isSupported` before loading a plugin. Unsupported plugins are silently skipped — no errors, no dead UI.

### Service Publish Patterns

Services adapt to the target automatically:

```ts
services: {
  compute: {
    src: './services/compute.ts',     // Source runs in dev + desktop
    publish: {
      local: './build/compute',        // Bundled with desktop app
      remote: 'https://api.example.com/compute',  // Used in web builds
    },
  },
}
```

- **Desktop:** The service binary is packaged with the app and spawned as a child process
- **Web/PWA:** The remote URL is used instead — no binary needed
- **Mobile:** Services are mapped to public IP addresses for local network access

### Strategy Pattern

Build strategies (`WebBuildStrategy`, `DesktopBuildStrategy`, `MobileBuildStrategy`) handle platform-specific concerns:

- Web: Vite build + PWA manifest
- Desktop: Vite build + Electron packaging + ASAR + code signing
- Mobile: Vite build + Capacitor project + native IDE integration

### `commoners` Global Flags

Every application has access to runtime platform detection:

```ts
const { WEB, DESKTOP, MOBILE, DEV, PROD, TARGET } = commoners

if (DESKTOP) {
  // Desktop-specific behavior
  const { __id } = DESKTOP
}

if (MOBILE) {
  // MOBILE is 'ios' | 'android' | false
  if (MOBILE === 'android') { /* Android-specific */ }
}
```

## Future Directions

### Conditional Imports with Vite Guards

Vite's [HMR conditional guard](https://vite.dev/guide/api-hmr#required-conditional-guard) pattern suggests a path for platform-specific imports that are tree-shaken at build time:

```ts
if (import.meta.env.COMMONERS_TARGET === 'desktop') {
  // This entire block is removed in web/mobile builds
  const { ipcRenderer } = await import('electron')
}
```

### Platform-Specific Storage

Different platforms have different storage primitives:

| Platform | Primary Storage | Secondary |
|----------|----------------|-----------|
| Web | IndexedDB, localStorage | Cache API |
| Desktop | File system, SQLite | Electron store |
| Mobile | Capacitor Preferences | SQLite, Keychain |

A future `@commoners/storage` plugin could abstract over these with a unified API and automatic backend selection.

### WASM as a Platform Enhancement

WASM services (see [Rust Services](/guide/services/rust)) represent a form of platform enhancement: computation that would normally require a server process can run directly in the browser. This enables PWA targets to access compiled Rust logic without any backend infrastructure.

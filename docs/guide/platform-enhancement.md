# Platform Enhancement

Commoners applications run across web, desktop, and mobile. This guide covers how to detect the current platform and adapt your application's behavior accordingly.

## Platform Detection

The `commoners` global object provides runtime flags for platform detection:

```ts
const {
  WEB,      // true if running as a web/PWA app
  DESKTOP,  // { __id, __main } if running in Electron, otherwise false
  MOBILE,   // 'ios' | 'android' if running in Capacitor, otherwise false
  DEV,      // true if in development mode
  PROD,     // true if in production mode
  TARGET,   // 'web' | 'electron' | 'ios' | 'android'
} = commoners
```

### Examples

```ts
// Show desktop-only features
if (commoners.DESKTOP) {
  document.getElementById('quit-btn').style.display = 'block'
  document.getElementById('quit-btn').onclick = () => commoners.quit()
}

// Adapt to mobile platform
if (commoners.MOBILE === 'android') {
  // Android-specific behavior
} else if (commoners.MOBILE === 'ios') {
  // iOS-specific behavior
}

// Dev-only debugging
if (commoners.DEV) {
  console.log('Services:', commoners.SERVICES)
}
```

## Feature Gating with Plugin `isSupported`

Plugins declare their platform compatibility using `isSupported`:

```ts
// my-plugin.ts
export const isSupported = {
  load: ({ WEB, DESKTOP, MOBILE }) => {
    if (MOBILE) return false           // Not available on mobile
    if (WEB) return 'usb' in navigator // Only if Web USB is available
    return true                        // Available on desktop
  },
}

export function load() {
  // This only runs if isSupported returned truthy
  return { /* plugin API */ }
}
```

### Capacitor Plugins

For mobile, plugins can specify Capacitor configuration:

```ts
export const isSupported = {
  capacitor: {
    name: 'BluetoothLe',
    plugin: '@capacitor-community/bluetooth-le',
    plist: { /* iOS permissions */ },
    manifest: { /* Android permissions */ },
    options: { /* Plugin options */ },
  },
  load: async ({ WEB }) => {
    if (WEB) return (await navigator.bluetooth?.getAvailability()) === true
  },
}
```

Commoners automatically:
- Injects permissions into `Info.plist` (iOS) and `AndroidManifest.xml` (Android)
- Adds plugin options to `capacitor.config.json`
- Disables the plugin if the Capacitor dependency isn't installed

## Service Adaptation

### Local vs Remote

Services adapt to the build target automatically:

```ts
// commoners.config.ts
export default {
  services: {
    api: {
      src: './services/api.ts',
      publish: {
        local: './build/api',                    // Desktop: bundled binary
        remote: 'https://api.example.com',       // Web: remote URL
      },
    },
  },
}
```

### WASM for Web

Use WASM services when you need compiled code to run in the browser:

```ts
import * as services from '@commoners/solidarity/services'

export default {
  services: {
    // Native binary for desktop
    ...services.rust.services([{
      name: 'compute',
      src: './services/compute/src/main.rs',
    }]),

    // WASM module for web
    ...services.wasm.services([{
      name: 'compute-wasm',
      src: './services/compute-wasm/src/lib.rs',
    }]),
  },
}
```

Frontend code can then choose the right service:

```ts
if (commoners.SERVICES['compute']) {
  // Use HTTP service (desktop)
  const response = await fetch(commoners.SERVICES.compute.url + '/process')
} else if (commoners.SERVICES['compute-wasm']) {
  // Use WASM module (web)
  const wasm = await import(commoners.SERVICES['compute-wasm'].url)
  const result = wasm.process(data)
}
```

## Storage Patterns

Different platforms have different storage capabilities:

```ts
// Simple cross-platform storage
function getStorage() {
  if (commoners.DESKTOP) {
    // Desktop: use file system via service
    return {
      get: (key) => fetch(`${commoners.SERVICES.storage.url}/${key}`).then(r => r.json()),
      set: (key, value) => fetch(`${commoners.SERVICES.storage.url}/${key}`, {
        method: 'PUT',
        body: JSON.stringify(value),
      }),
    }
  }

  // Web/Mobile: use localStorage
  return {
    get: (key) => Promise.resolve(JSON.parse(localStorage.getItem(key))),
    set: (key, value) => Promise.resolve(localStorage.setItem(key, JSON.stringify(value))),
  }
}
```

## Best Practices

1. **Start with web.** Build the web version first — it works everywhere and has the most constraints. Then enhance for other platforms.

2. **Use `isSupported` for plugins.** Don't conditionally load plugins in your config. Let the framework handle platform detection through the `isSupported` API.

3. **Prefer `invoke` over `sendSync`.** For desktop IPC, always use the async `invoke` pattern. This keeps code compatible with future non-Electron runtimes.

4. **Publish patterns over conditionals.** Use the service `publish` configuration to handle local/remote switching. Avoid `if (DESKTOP)` checks around service URLs.

5. **Test all targets.** Use `pnpm test:start`, `pnpm test:build`, and `pnpm test:desktop` to verify your application works across targets. Mobile headless testing is available via `COMMONERS_HEADLESS=true`.

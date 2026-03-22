# Why Commoners?

## The Problem
You have a web app. You want it on desktop, mobile, and the web — ideally from one codebase. Maybe you also have backend services in Python, Rust, or Node that need to ship alongside it.

Existing tools solve parts of this:
- **Electron / Tauri** handle desktop (and Tauri 2.0 adds mobile), but don't manage your backend services.
- **Capacitor** handles mobile, but can't bundle local backends or manage desktop.
- **Framework-specific SDKs** (React Native, Quasar) lock you into a single frontend framework.

No single tool handles the full picture: **your app on every platform**, with backend services that compile, bundle, and deploy automatically.

## What Commoners Does Differently
Commoners is a CLI tool that reads a single `commoners.config.ts` and handles the rest:

1. **Declares services in any language** -- TypeScript, Python, C++, Rust. Each service gets auto-compiled and bundled for your target platform.
2. **Adapts services to the target** -- On desktop, services run as local processes bundled inside the app. On web and mobile, the same services deploy remotely. Your frontend code doesn't change.
3. **Stays framework-agnostic** -- Your frontend is HTML, CSS, and JavaScript. Use React, Vue, Svelte, or nothing at all.
4. **Manages platform-specific code** -- Plugins handle Bluetooth, Serial, window management, and other platform APIs without polluting your core logic.

## How It Compares

| Feature | Commoners | Tauri | Capacitor | Quasar | Expo |
|---|---|---|---|---|---|
| Web | Yes | No | Yes | Yes | Yes (limited) |
| Desktop | Electron (Tauri planned) | Webview | No | Electron | No |
| Mobile | Capacitor | iOS / Android | Native | Cordova | React Native |
| Backend services | **Any language** | Rust + sidecars | None | None | None |
| Auto-bundle backends | **Yes** | No | No | No | No |
| Frontend framework | Any | Any | Any | Vue | React |
| Local + remote services | **Yes** | No | No | No | No |
| Desktop app size | Electron + 70 KB, Tauri + 20 KB | 12 MB | – | 268 MB | – |

Commoners is the tool that gets your app — frontend and backend — onto every platform from one config.

### A note on desktop app size

Commoners currently uses Electron for desktop, which bundles Chromium (~200 MB). This is the same trade-off Slack, VS Code, and Discord make. If binary size is critical and you don't need multi-language backend services, [Tauri](https://tauri.app) produces ~10 MB desktop apps using the system webview. Commoners plans to support Tauri as an alternative desktop runtime — your services and plugins will work with either.

## Where Commoners Came From
Commoners was built at [Neural Interfaces](https://github.com/neuralinterfaces) for an impossible task: distributing a single Bluetooth-enabled application across web (Chrome), desktop (Mac/Windows/Linux), and mobile (iOS/Android) -- with real-time brain-computer interface backends written in Python and C++. [It works.](https://github.com/neuralinterfaces/brainsatplay)

Since then, Commoners has been used for commercial products at [Universal Brain](https://universal-brain.com/) and continues to evolve as a general-purpose cross-platform tool.

## When to Use Something Else

For a detailed comparison with Tauri, Electron, and Capacitor, see [Choosing the Right Tool](./guide/comparisons.md).

Commoners is not always the right choice:

- **You need native performance everywhere** -- Flutter or fully native development (Swift/Kotlin/C++) will outperform WebView-based apps.
- **You only need desktop with Rust** -- Tauri produces smaller binaries and has a mature Rust integration. Commoners plans to support Tauri as an alternative desktop runtime.
- **You only need mobile** -- Capacitor or React Native may be simpler if you don't need desktop or multi-language backends.
- **You're locked into a framework** -- Quasar (Vue) and Expo (React) offer deeper integration with their respective ecosystems.

## Platform-Specific Tools We Build On
Commoners composes existing tools rather than replacing them:

- [Vite](https://vitejs.dev) -- Build tooling and dev server for all platforms.
- [Electron](https://www.electronjs.org) -- Desktop runtime (Chromium + Node.js).
- [Capacitor](https://capacitorjs.com) -- Mobile runtime (native WebViews).

Commoners adds the orchestration layer that connects these tools with your backend services and manages the differences between platforms.

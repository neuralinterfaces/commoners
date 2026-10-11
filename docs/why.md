# Why Commoners?

## The Problem
You have a web prototype that works. Turning it into a product means shipping it to the web, desktop and mobile, often with backend services in Python, Rust or Node, and being able to show what each release contains. That last part used to take a large team.

Existing tools each solve part of this, and Commoners sits on top of them rather than replacing them:
- **Tauri / Electron** run your app on desktop (Tauri 2 adds mobile), but leave building and supervising your backend services to you.
- **Capacitor** runs your app on mobile, but can't bundle local backends or cover desktop.
- **Framework-specific SDKs** (React Native, Quasar) tie you to a single frontend framework.

## What Commoners Adds
Commoners is an orchestration layer driven by a single `commoners.config.ts`:

1. **Services in any language.** TypeScript, Python, C++, Rust or WASM. Each service is built for the target platform, bundled, started, health-checked and stopped with your app.
2. **Services that adapt to the target.** On desktop, services run as local processes inside the app. On web and mobile, the same services deploy remotely. Your frontend code doesn't change.
3. **Secure by default, on every target.** One Content Security Policy across web, Electron and Tauri, isolation and sandboxing on, and (opt-in) signed service binaries checked against your publisher at launch on Electron. See [Security](./guide/security.md).
4. **Every build shows its work.** Production builds write a CycloneDX software bill of materials and a manifest of settings, features and file hashes. See [Build Record](./guide/config.md#build-record).
5. **Framework-agnostic.** Your frontend is HTML, CSS and JavaScript. Use React, Vue, Svelte, or nothing at all.

## What Commoners Adds to Each Runtime

| Runtime | What it gives you | What Commoners adds |
|---|---|---|
| Tauri | Small desktop apps on the system webview; Rust core | Builds and supervises your services as sidecars; shared CSP; build record; the same config as your other targets |
| Electron | Bundled Chromium + Node; mature ecosystem | Service build, supervision and launch-time verification; secure defaults; optional `app://` origin; build record |
| Capacitor | iOS and Android from web code | The same frontend and remote services as your web and desktop builds |
| Browser (PWA) | No install | Security headers and a meta CSP generated for your host; build record |

### Choosing a desktop runtime

Choose per build: Tauri (system webview, around 10 MB) or Electron (bundled Chromium, around 200 MB). Services work with both. Most plugins are Electron-only today; see the plugin table for each one's status.

## From Prototype to Product
Commoners was built at [Neural Interfaces](https://github.com/neuralinterfaces) for a hard task: distributing one Bluetooth-enabled application across web (Chrome), desktop (Mac/Windows/Linux) and mobile (iOS/Android), with real-time brain-computer interface backends written in Python and C++. [It works.](https://github.com/neuralinterfaces/brainsatplay)

Apps like that carry hardware access and scientific backends, and the teams behind them have to show what is in each build. That shaped the defaults:
- one security policy across targets;
- service binaries that can be checked against their publisher at launch;
- build-time removal of what a build doesn't need;
- a record of every production build.

**What Commoners is not:** it is a framework. It isn't certified or validated, and it doesn't make a product compliant. The team shipping the product owns its documentation. Commoners makes the evidence that comes from your build (the SBOM, the configuration and the file hashes) cheap to produce and easy to check.

## When to Use Something Else

For a detailed comparison, see [Choosing the Right Tool](./guide/comparisons.md).

- **You need native performance everywhere.** Flutter or fully native development (Swift/Kotlin/C++) will outperform WebView-based apps.
- **You only need a desktop app with no extra services.** Plain Tauri or Electron is simpler.
- **You only need mobile.** Capacitor or React Native may be simpler if you don't need desktop or multi-language backends.
- **You're committed to one framework.** Quasar (Vue) and Expo (React) integrate more deeply with their ecosystems.

## Tools We Build On
Commoners adds the orchestration layer that connects these tools with your backend services and manages the differences between platforms:

- [Vite](https://vitejs.dev): build tooling and dev server for all platforms.
- [Tauri](https://tauri.app): desktop runtime on the system webview.
- [Electron](https://www.electronjs.org): desktop runtime (Chromium + Node.js).
- [Capacitor](https://capacitorjs.com): mobile runtime (native WebViews).

# Choosing the Right Tool

Every cross-platform framework makes trade-offs. This page is an honest guide to help you pick the right one — even if it's not Commoners.

## At a Glance

| | Commoners | Tauri | Capacitor | Electron |
|---|---|---|---|---|
| **Platforms** | Web + Desktop + Mobile | Desktop + Mobile | Mobile + PWA | Desktop |
| **Backend services** | Any language, auto-bundled | Rust + manual sidecars | – | Node.js (in-process) |
| **Desktop runtime** | Electron or Tauri | System webview | – | Chromium |

Commoners adds a ~20 KB runtime on top of the underlying tool. For desktop builds, Electron is 268 MB and Tauri is 12 MB, so the overhead is negligible. Run `bash examples/bench/benchmark.sh --desktop` to reproduce.

## When to Choose Commoners

**You have backend services that need to ship with your app.** This is Commoners' unique capability. If your app includes a Python ML model, a Rust data processor, or a Node API server, Commoners will compile, bundle, and deploy those services alongside your frontend — automatically adapting to each target platform. We haven't found another framework that does this from a single config.

**You need web, desktop, and mobile from one codebase.** Most tools cover one or two platforms. Commoners covers all three, using Vite for web, Tauri or Electron for desktop, and Capacitor for mobile.

**You want platform-specific capabilities without platform-specific code.** Commoners plugins (Bluetooth, Serial, notifications, storage, etc.) provide a single API that adapts to each runtime — Web APIs in the browser, the desktop runtime's native bridge, Capacitor plugins on mobile. Most plugins are Electron-only on desktop today.

**You're building scientific, research, or hardware-connected applications.** Commoners was built for brain-computer interfaces: apps that combine web UIs with Python/C++ backends and Bluetooth hardware, and whose teams have to show what each build contains. If your app looks anything like that, Commoners was designed for it.

**You need to show what you shipped.** Production builds write a CycloneDX SBOM and a manifest of settings and file hashes (see [Build Record](./config.md#build-record)), and security controls are on by default across targets (see [Security](./security.md)).

## When to Choose Something Else

### Plain Tauri (without Commoners)

Commoners can build with Tauri as its desktop runtime (`--target tauri`). This section is about when you don't need the layer at all.

**Choose plain Tauri if:** You only need desktop (or desktop + mobile), your backend is Rust, and you have no other services to build and supervise.

Tauri uses the operating system's native webview instead of bundling Chromium, producing desktop apps as small as 600 KB. It has a mature Rust integration, strong security model, and active community. Tauri 2.0 adds mobile support (iOS/Android).

**What you'd handle yourself without Commoners:**
- A web target alongside the desktop app
- Building, bundling and supervising sidecars written in other languages
- One security policy and build record shared with your other targets

### Electron (standalone)

**Choose Electron if:** You need a mature, stable desktop runtime with the largest ecosystem of examples, plugins, and community support.

Electron powers VS Code, Slack, Discord, and thousands of other apps. It's the most proven desktop framework available. If you're building a desktop-only app with no backend services, using Electron directly avoids the abstraction layer Commoners adds.

**Trade-offs vs. Commoners:**
- Desktop only — no mobile, no web deployment
- No service orchestration — you manage backend processes yourself
- Large app size (~200–300 MB), the same as Commoners builds that use Electron; Commoners builds with Tauri are far smaller
- You lose the plugin system, config-driven builds, and multi-platform targeting

### Capacitor (standalone)

**Choose Capacitor if:** You only need mobile (iOS/Android) and PWA, and you have no backend services to bundle.

Capacitor is a mature mobile runtime with excellent native API access, a Cordova compatibility layer, and support for any frontend framework. It's simpler than Commoners if you don't need desktop or backend services.

**Trade-offs vs. Commoners:**
- No desktop target
- No backend service management
- You'll need to separately handle any backend deployment
- Commoners uses Capacitor under the hood for mobile, so you get its capabilities either way

### Flutter / React Native / Native Development

**Choose native if:** Performance is your top priority and you don't need multi-language backend services.

Flutter (Dart) and React Native (JavaScript/React) produce truly native UIs that outperform any WebView-based approach. Fully native development (Swift/Kotlin/C++) gives maximum control. These are the right choice for consumer apps where animation smoothness and native feel matter more than backend orchestration.

**Trade-offs vs. Commoners:**
- Lock you into a specific language/framework
- No backend service bundling
- Multiple codebases for web + mobile + desktop (unless using Flutter, which covers mobile + desktop but not web backends)

## The Bottom Line

Most cross-platform tools solve **frontend distribution** — getting your UI onto multiple platforms. Commoners solves **app distribution** — getting your entire application, including backend services in any language, onto every platform from one config.

If you don't have backend services, a more focused tool (Tauri for desktop, Capacitor for mobile) will be simpler. If you do, Commoners handles the full picture, and keeps a record of each build, without you building custom packaging and deployment infrastructure.

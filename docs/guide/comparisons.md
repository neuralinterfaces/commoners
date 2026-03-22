# Choosing the Right Tool

Every cross-platform framework makes trade-offs. This page is an honest guide to help you pick the right one — even if it's not Commoners.

## At a Glance

| | Commoners | Tauri | Capacitor | Electron |
|---|---|---|---|---|
| **Platforms** | Web + Desktop + Mobile | Desktop + Mobile | Mobile + PWA | Desktop |
| **Backend services** | Any language, auto-bundled | Rust + manual sidecars | – | Node.js (in-process) |
| **Frontend framework** | Any | Any | Any | Any |
| **Desktop runtime** | Electron or Tauri | System webview | – | Chromium |
| **App size** | Vite + 20 KB (500%)<br/>Electron + 70 KB (<0.03%)<br/>Tauri + 20 KB (<0.2%) | 12 MB | – | 268 MB |
| **License** | MIT | MIT/Apache-2.0 | MIT | MIT |

The 500% web overhead is relative to an empty HTML file (4 KB). In a real app with frontend code, the baseline is typically hundreds of KB or more, making Commoners' 20 KB runtime negligible. Apps with plugins include the full plugin runtime (~13 KB); apps without get only the minimal core (~5 KB). Run `bash examples/bench/benchmark.sh --desktop` to reproduce these numbers.

## When to Choose Commoners

**You have backend services that need to ship with your app.** This is Commoners' unique capability. If your app includes a Python ML model, a Rust data processor, or a Node API server, Commoners will compile, bundle, and deploy those services alongside your frontend — automatically adapting to each target platform. No other framework does this from a single config.

**You need web, desktop, and mobile from one codebase.** Most tools cover one or two platforms. Commoners covers all three, using Vite for web, Electron for desktop, and Capacitor for mobile.

**You want platform-specific capabilities without platform-specific code.** Commoners plugins (Bluetooth, Serial, notifications, storage, etc.) provide a single API that adapts to each runtime — Web APIs in the browser, Electron IPC on desktop, Capacitor plugins on mobile.

**You're building scientific, research, or hardware-connected applications.** Commoners was built for brain-computer interfaces — apps that combine web UIs with Python/C++ backends and Bluetooth hardware. If your app looks anything like that, this is probably the only tool that handles it out of the box.

## When to Choose Something Else

### Tauri

**Choose Tauri if:** You only need desktop (or desktop + mobile), your backend is Rust, and binary size matters.

Tauri uses the operating system's native webview instead of bundling Chromium, producing desktop apps as small as 600 KB. It has a mature Rust integration, strong security model, and active community. Tauri 2.0 adds mobile support (iOS/Android).

**Trade-offs vs. Commoners:**
- No web target — Tauri builds native apps, not web apps
- Backend is Rust-first — other languages require manual sidecar configuration
- No automatic service bundling — you manage service compilation and packaging yourself
- Mobile support is newer and less battle-tested than Capacitor

Commoners plans to support Tauri as an alternative desktop runtime, so you'll eventually be able to get Tauri's small binaries with Commoners' service orchestration.

### Electron (standalone)

**Choose Electron if:** You need a mature, stable desktop runtime with the largest ecosystem of examples, plugins, and community support.

Electron powers VS Code, Slack, Discord, and thousands of other apps. It's the most proven desktop framework available. If you're building a desktop-only app with no backend services, using Electron directly avoids the abstraction layer Commoners adds.

**Trade-offs vs. Commoners:**
- Desktop only — no mobile, no web deployment
- No service orchestration — you manage backend processes yourself
- Large app size (~200–300 MB) — same as Commoners, since Commoners uses Electron
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

If you don't have backend services, a more focused tool (Tauri for desktop, Capacitor for mobile) will be simpler. If you do, Commoners is likely the only tool that handles the full picture without requiring you to build custom packaging and deployment infrastructure.

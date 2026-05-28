# Architecture

Commoners is an orchestration layer. It reads a single `commoners.config.ts` and delegates to specialized tools — Vite for bundling, Electron for desktop, Capacitor for mobile — while managing services, plugins, and platform differences.

## How a Command Flows

```mermaid
flowchart TB
    CLI["CLI Command<br/><code>commoners dev | build | launch</code>"]
    CLI --> LoadConfig

    subgraph Config["Configuration"]
        LoadConfig["Load Config<br/><small>esbuild → .tmp/commoners.config.mjs</small>"]
        LoadConfig --> ResolveConfig["Resolve Config<br/><small>classify extensions, resolve services,<br/>merge package.json</small>"]
    end

    ResolveConfig --> Route{Command?}

    Route -->|dev| Dev
    Route -->|build| Build
    Route -->|launch| Launch

    subgraph Dev["Dev Mode"]
        direction TB
        ViteDev["Vite Dev Server<br/><small>HMR + WebSocket</small>"]
        BuildDevServices["Build Services<br/><small>→ .commoners/.tmp/services/</small>"]
        StartServices["Start Services<br/><small>spawn processes</small>"]
        PluginHooks["Plugin Lifecycle<br/><small>init → ready → quit</small>"]
        ViteDev --> BuildDevServices --> StartServices --> PluginHooks
    end

    subgraph Build["Build Mode"]
        direction TB
        SelectStrategy{"Select Strategy<br/><small>by --target flag</small>"}
        SelectStrategy -->|web, pwa| WebStrategy["WebBuildStrategy"]
        SelectStrategy -->|desktop, electron| ElectronStrategy["ElectronBuildStrategy"]
        SelectStrategy -->|mobile, ios, android| MobileStrategy["MobileBuildStrategy"]
        SelectStrategy -->|tauri| TauriStrategy["TauriBuildStrategy"]

        WebStrategy & ElectronStrategy & MobileStrategy & TauriStrategy --> ViteBuild

        ViteBuild["Vite Build Frontend<br/><small>→ staging/</small>"]
        ViteBuild --> BundleConfig["Bundle Config<br/><small>.mjs (browser) + .cjs (Electron)</small>"]
        BundleConfig --> BuildServices["Build Services"]

        subgraph ServiceBuilders["Service Builders"]
            direction LR
            JS["JS/TS<br/><small>esbuild</small>"]
            PY["Python<br/><small>PyInstaller</small>"]
            RS["Rust<br/><small>Cargo</small>"]
            WASM["WASM<br/><small>wasm-pack</small>"]
            CPP["C++<br/><small>g++ / MSVC</small>"]
        end

        BuildServices --> ServiceBuilders
        ServiceBuilders --> PlatformBuild["Platform Package<br/><small>ASAR, .app, .apk, etc.</small>"]
    end

    subgraph Launch["Launch Mode"]
        direction TB
        ResolveOutput["Resolve Output Dir<br/><small>.commoners/[target]/</small>"]
        ResolveOutput --> LaunchStrategy{"Launch Strategy"}
        LaunchStrategy -->|web| ServeStatic["Static Server"]
        LaunchStrategy -->|electron| ElectronWindow["Electron Window"]
        LaunchStrategy -->|mobile| Emulator["Emulator / Device"]
    end
```

## Config Bundling

The config is bundled **three ways** to strip sensitive or irrelevant data per target:

| Bundle | Format | Includes | Strips | Used By |
|--------|--------|----------|--------|---------|
| **Node.js** | Full ESM | Everything | Nothing | Config resolution (build time) |
| **Browser** (`.mjs`) | ESM | `plugins` | Service `src`, `port`, `build`, `env` | Frontend runtime |
| **Electron** (`.cjs`) | CJS | `name`, `icon`, `electron`, `plugins`, `services`, `hooks` | Browser-only props | Electron main process |

This ensures service source code and environment variables never leak into browser bundles.

## Extensions System

Plugins and services are unified under `config.extensions`. Each extension is automatically classified:

```mermaid
flowchart LR
    Ext["Extension<br/>in config"]
    Ext --> Classify{"Has lifecycle<br/>hooks?"}
    Classify -->|yes| Plugin["Plugin<br/><small>load, start, ready, quit</small>"]
    Classify -->|no| Check2{"Has src<br/>or port?"}
    Check2 -->|yes| Service["Service<br/><small>JS, Python, Rust, C++, WASM</small>"]
    Check2 -->|no| Static["Static Extension"]
    Plugin --> Hybrid{"Also has<br/>src or port?"}
    Hybrid -->|yes| Both["Plugin + Service<br/><small>hybrid extension</small>"]
```

At runtime, `commoners.SERVICES` provides URLs and `commoners.READY` resolves plugin APIs. Your frontend code doesn't need to know whether a service runs locally (desktop) or remotely (web/mobile).

## Build Strategies

The build system uses the Strategy pattern. Each target registers a build strategy and a launch strategy:

| Target | Build Strategy | Launch Strategy | Runtime |
|--------|---------------|----------------|---------|
| `web` | WebBuildStrategy | Static server | Browser |
| `pwa` | WebBuildStrategy | Static server | Browser + SW |
| `electron` / `desktop` | ElectronBuildStrategy | Electron window | Chromium + Node.js |
| `tauri` | TauriBuildStrategy | Tauri window | System webview + Rust |
| `ios` / `android` / `mobile` | MobileBuildStrategy | Capacitor CLI | Native webview |

New targets can be added by registering a strategy with `BuildFlow.registerStrategy()`.

## Directory Layout

```
my-app/
├── commoners.config.ts          ← single source of truth
├── src/                         ← your frontend code
├── .commoners/                  ← generated (gitignored)
│   ├── .tmp/                    ← dev mode artifacts
│   │   ├── commoners.config.mjs ← loaded config
│   │   └── services/            ← dev service binaries
│   ├── services/                ← production service binaries
│   ├── electron/                ← Electron build output
│   ├── web/                     ← web build output
│   └── mobile/                  ← Capacitor project
```

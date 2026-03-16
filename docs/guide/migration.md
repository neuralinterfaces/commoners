# Adding Commoners to an Existing Project

Commoners is designed to work with existing web apps. This guide covers what works, what needs adjustment, and what isn't supported.

## Quick Start

Run `commoners init` in your project root:

```bash
pnpm add -D commoners@latest
npx commoners init
```

This creates a `commoners.config.ts` and adds scripts to your `package.json`. Your existing `index.html` becomes the default entry point.

## What Works Out of the Box

### Vite-based projects
If your project already uses Vite (React + Vite, Vue + Vite, Svelte + Vite, vanilla), Commoners works immediately. Your `vite.config.ts` is merged with Commoners' config automatically.

**Supported:** `create-vite`, Vite + React, Vite + Vue, Vite + Svelte, Vite + Lit, Vite + vanilla

### Static HTML/CSS/JS
Any project with an `index.html` entry point works. No build tool required — Commoners uses Vite internally.

### Projects with backend services
If you have a Python, Rust, C++, or Node backend, declare it in the config and Commoners handles compilation, bundling, and port management:

```ts
// commoners.config.ts
export default {
  services: {
    api: { src: './backend/server.py' },
    engine: { src: './compute/main.rs' },
  }
}
```

## What Needs Adjustment

### Webpack-based projects (Create React App, Vue CLI)
Commoners uses Vite, not Webpack. You'll need to migrate your build tooling:

1. **Create React App:** Use [a Vite migration guide](https://vitejs.dev/guide/migration-from-cra) to convert, then add Commoners
2. **Vue CLI:** Migrate to `create-vue` (Vite-based), then add Commoners
3. **Angular CLI:** Not directly supported — Angular uses its own build system

**Estimated effort:** 1-2 hours for a typical CRA or Vue CLI project. The main work is replacing Webpack-specific config (aliases, loaders) with Vite equivalents.

### Next.js / Nuxt / SvelteKit
These are **full-stack frameworks** with their own server-side rendering, routing, and build pipelines. Commoners doesn't replace them — it serves a different purpose.

**What Commoners does:** Deploys a frontend + backend services to web/desktop/mobile from one config.
**What Next.js does:** Server-side rendered React with API routes, middleware, and hosting integration.

If you need SSR, use Next.js/Nuxt/SvelteKit for web and consider Commoners only for the desktop/mobile deployment of a separate frontend.

### Existing Electron apps
If you already have an Electron app and want Commoners' service orchestration:

1. Your renderer code (HTML/CSS/JS) works as-is — point `pages` to your HTML files
2. Your main process code needs refactoring — Commoners manages the main process
3. Your preload scripts are replaced by Commoners' preload (which exposes `commoners` global)
4. IPC patterns change: use `commoners.send()`/`commoners.on()` instead of raw `ipcRenderer`

**Estimated effort:** Half a day for simple Electron apps. Longer if you have complex main process logic.

### Existing Tauri apps
Similar to Electron migration — your frontend works, but Commoners generates `src-tauri/` including `main.rs` and `tauri.conf.json`. Custom Rust commands need to be moved into Commoners' plugin system or custom Tauri config.

### Existing Capacitor apps
Your web frontend works. Commoners manages the Capacitor integration, so:
- `capacitor.config.json` is generated from `commoners.config.ts`
- Native plugins (camera, filesystem, etc.) work via Capacitor's standard API
- Commoners adds service orchestration on top

## What's Not Supported

| Scenario | Why | Alternative |
|----------|-----|-------------|
| **Server-side rendering (SSR)** | Commoners builds static frontends, not server-rendered apps | Use Next.js/Nuxt for SSR; Commoners for desktop/mobile |
| **Angular CLI** | Angular's build system (esbuild/Webpack) isn't Vite-compatible | Migrate to Analog (Vite-based Angular) first |
| **Non-web frontends** (Flutter, React Native) | Commoners wraps web content in native containers | Use Flutter/RN directly for native UI |
| **Monorepo with multiple apps** | One `commoners.config.ts` = one app | Run Commoners per-app in the monorepo |
| **Custom Webpack plugins** | No Webpack support | Migrate to Vite plugin equivalents |

## Gauging Migration Difficulty

| Your current setup | Effort | What changes |
|-------------------|--------|-------------|
| **Vite + any framework** | Minutes | Add config, add scripts |
| **Static HTML/CSS/JS** | Minutes | Add config, add scripts |
| **CRA (Create React App)** | 1-2 hours | Migrate to Vite first |
| **Vue CLI** | 1-2 hours | Migrate to create-vue first |
| **Existing Electron app** | Half day | Refactor main process, IPC patterns |
| **Existing Tauri app** | Half day | Let Commoners generate src-tauri/ |
| **Existing Capacitor app** | 1-2 hours | Let Commoners manage Capacitor config |
| **Next.js / Nuxt / SvelteKit** | Not recommended | Different architecture |
| **Angular CLI** | 2-4 hours | Migrate to Analog (Vite) first |

## After Init

Once `commoners init` has created your config:

```bash
# Development (web)
pnpm dev

# Development (desktop)
pnpm dev:desktop

# Build for web
pnpm build

# Build for desktop
pnpm build:desktop

# Build for mobile
pnpm build:mobile
```

See the [Getting Started](/getting-started) guide for next steps, including adding services, plugins, and platform-specific configuration.

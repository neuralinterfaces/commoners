# Build Adapter Interface

Long-term plan for abstracting the build tooling layer so that Commoners is not permanently coupled to Vite. This is a **future-proofing exercise**, not an urgent migration.

**Status:** Design phase. No implementation until a concrete need arises (e.g., Vite 8 breaks something fundamental, or a user requests Webpack/Turbopack support).

---

## Motivation

Commoners currently uses Vite for:
1. **Dev server** — HMR, proxy, WebSocket
2. **Frontend bundling** — HTML entry points, asset compilation
3. **Plugin system** — virtual modules, HTML injection, config capture
4. **Electron/Tauri dev** — `configureServer` hook to spawn desktop processes

The coupling is **concentrated** (9 files in `packages/core/vite/`, 2 files outside) and **well-organized** (Strategy pattern for build flows, lazy `import('vite')` in globals.ts). But if a user needed Webpack, Turbopack, or bare Rollup, there's no path today.

---

## Current Coupling Analysis

### Already Framework-Agnostic

| Component | Location | Notes |
|-----------|----------|-------|
| Config resolution | `index.ts` | Pure TS, no bundler |
| Build strategies | `flows/` | Strategy pattern, platform-specific |
| Service compilation | `assets/services/` | esbuild (standalone) |
| Plugin lifecycle | `assets/plugins/` | Load/unload/ready hooks |
| ASAR/security | `utils/asar/` | Post-build, no bundler |
| SEA compilation | `utils/sea.ts` | esbuild (standalone) |
| Electron main/preload | `assets/electron/` | Bundled by Rollup via Vite, but could use any bundler |

### Tightly Coupled to Vite

| Component | Files | Vite APIs Used |
|-----------|-------|----------------|
| Dev server | `vite/index.ts` | `createServer()`, `loadEnv()`, `loadConfigFromFile()` |
| Build pipeline | `vite/index.ts`, `flows/BuildFlow.ts` | `build()`, `defineConfig()`, `mergeConfig()` |
| Commoners plugin | `vite/plugins/commoners.ts` | `resolveId`, `load`, `handleHotUpdate`, `transformIndexHtml` |
| Electron plugin | `vite/plugins/electron/` | `configureServer`, `config`, `closeBundle` |
| Tauri plugin | `vite/plugins/tauri/` | `configureServer`, `config` |
| HTML asset build | `utils/assets.ts` | `build()` for HTML bundling |

---

## Proposed Interface

```typescript
/**
 * BuildAdapter abstracts the bundler/dev-server layer.
 * Default implementation: ViteBuildAdapter (current behavior).
 * Future implementations: RollupBuildAdapter, WebpackBuildAdapter, etc.
 */
export interface BuildAdapter {
  readonly name: string

  // ── Dev Server ──
  createDevServer(config: AdapterConfig): Promise<AdapterDevServer>

  // ── Building ──
  build(config: AdapterConfig): Promise<AdapterBuildResult>

  // ── Config Utilities ──
  loadEnv(mode: string, root: string): Record<string, string>
  mergeConfig(base: any, override: any): any

  // ── Plugin Registration ──
  // Adapters translate AdapterPlugins into their native plugin format
  createPlugin(plugin: AdapterPlugin): any
}

export interface AdapterDevServer {
  url: string
  close(): Promise<void>
  // Hook for desktop runtimes to know when server is ready
  onReady(callback: () => void): void
}

export interface AdapterBuildResult {
  outDir: string
  assets: string[]
}

export interface AdapterConfig {
  root: string
  outDir: string
  mode: 'development' | 'production'
  base?: string
  entry: Record<string, string>  // name → HTML/JS path
  external?: string[]
  plugins?: AdapterPlugin[]
  // Raw bundler-specific config (escape hatch)
  raw?: any
}

/**
 * AdapterPlugin is a subset of Vite's Plugin interface.
 * Only includes hooks that Commoners actually uses.
 */
export interface AdapterPlugin {
  name: string
  apply?: 'serve' | 'build'

  // Virtual modules
  resolveId?(id: string): string | null | undefined
  load?(id: string): string | null | undefined

  // HTML transformation
  transformHTML?(html: string, context: { path: string; mode: string }): string | void

  // Dev server
  configureDevServer?(server: AdapterDevServer): void

  // Build lifecycle
  onBuildComplete?(): void | Promise<void>
}
```

---

## Implementation Strategy

### Phase 1: Extract Interface (Low effort, do anytime)

Define the `BuildAdapter` interface in `packages/core/types.ts`. Create `ViteBuildAdapter` that wraps current behavior. No behavioral changes — pure refactoring.

**Files:**
- `packages/core/adapters/types.ts` — Interface definitions
- `packages/core/adapters/vite.ts` — Current Vite behavior wrapped in adapter

**Risk:** None. Current behavior unchanged.

### Phase 2: Wire Through Build Flow (Medium effort)

Replace direct `vite` imports in `BuildFlow.ts`, `start.ts`, and `utils/assets.ts` with adapter calls. The adapter is resolved from config or defaults to Vite.

**Files to modify:**
- `packages/core/flows/BuildFlow.ts` — Use `adapter.build()` instead of `_vite.build()`
- `packages/core/start.ts` — Use `adapter.createDevServer()` instead of `createServer()`
- `packages/core/utils/assets.ts` — Use `adapter.build()` for HTML assets
- `packages/core/globals.ts` — Export adapter factory instead of raw `import('vite')`

### Phase 3: Plugin Adapter Layer (High effort, only if needed)

Translate `AdapterPlugin` into native Vite plugins. This is where the real complexity lives — `transformIndexHtml`, `handleHotUpdate`, and virtual modules are Vite-specific APIs.

**Options:**
1. **Thin wrapper** — `AdapterPlugin` maps 1:1 to Vite hooks (current approach, easy)
2. **Rewrite injection** — Move HTML injection out of plugin system into build pipeline (harder but more portable)
3. **Hybrid** — Keep Vite plugins for Vite adapter, rewrite for others

Recommendation: Option 1 for now. Only pursue Option 2 if a non-Vite adapter is actually needed.

---

---

## Service Bundler Extensibility

Currently, service compilation is hardcoded per language:
- **JS/TS** → esbuild
- **Python** → PyInstaller
- **Rust** → Cargo
- **C++** → g++
- **WASM** → wasm-pack / Emscripten

Users who want to add a new language (Go, Zig, Dart, etc.) or customize the build for an existing one must use `build` hooks — which are per-service, not reusable.

### Proposed: ServiceBundler Registry

```typescript
/**
 * ServiceBundler handles compilation for a specific language/extension.
 * Users register bundlers by extension; Commoners dispatches to the right one.
 */
export interface ServiceBundler {
  readonly name: string
  readonly extensions: string[]  // e.g. ['.go'], ['.zig'], ['.dart']

  // Check if the toolchain is available
  check?(): Promise<{ available: boolean; message?: string }>

  // Compile source to executable/output
  build(opts: ServiceBundleOptions): Promise<ServiceBundleResult>

  // Optional: dev-mode behavior (watch, incremental)
  watch?(opts: ServiceBundleOptions, onChange: () => void): Promise<{ stop: () => void }>
}

export interface ServiceBundleOptions {
  src: string         // Source file path
  outDir: string      // Output directory
  name: string        // Service ID
  mode: 'development' | 'production'
  env?: Record<string, string>
  profile?: string    // e.g. 'dev' | 'release' for Rust
}

export interface ServiceBundleResult {
  filepath: string    // Path to compiled output
  executable: boolean // Is it a standalone binary?
  wasm?: boolean      // Is it a WASM module?
}
```

### Design Principle: Extensions Are Portable

Bundlers should be declared **by the extension itself**, not globally. An extension (service or plugin) is a portable unit — it carries its own build logic. Commoners core provides default bundlers for common languages but never forces them.

```typescript
// A Go service extension declares its own bundler
// Published as an npm package, portable across any Commoners project
export default {
  src: './api.go',
  bundler: {
    name: 'go',
    extensions: ['.go'],
    async build({ src, outDir, name, mode }) {
      const env = mode === 'production' ? {} : { GOFLAGS: '-gcflags=all=-N -l' }
      execSync(`go build -o ${join(outDir, name)} ${src}`, { env: { ...process.env, ...env } })
      return { filepath: join(outDir, name), executable: true }
    },
  },
}
```

```typescript
// commoners.config.ts — the user just imports and uses it
import goApi from '@my-org/go-api-service'

export default {
  name: 'my-app',
  services: {
    api: goApi,  // Bundler travels with the extension
  },
}
```

Core's built-in bundlers (esbuild, Cargo, PyInstaller, g++) are the **fallback** — they activate when an extension doesn't declare its own bundler and the file extension matches a known language. Users can also override defaults globally:

```typescript
export default {
  name: 'my-app',
  // Override the default TS bundler for all services
  bundlers: { '.ts': myCustomTsBundler },
}
```

### Resolution Order

1. Extension's own `bundler` field (highest priority — portable)
2. Global `bundlers` config overrides (user-level customization)
3. Core built-in bundlers (default fallback)

### Relationship to Build Adapter

The **Build Adapter** handles the *frontend* build (HTML, CSS, JS for the browser). The **Service Bundler** handles *backend* compilation (executables, WASM, scripts). They're independent axes:

```
                    Frontend Build          Service Compilation
                    ──────────────          ───────────────────
Interface:          BuildAdapter            ServiceBundler
Default:            ViteBuildAdapter        esbuild/Cargo/PyInstaller/g++
User-extensible:    adapter: 'webpack'      bundlers: { '.go': goBundler }
Extension-portable: N/A (frontend concern)  service.bundler: { ... }
```

---

## User-Facing API (Combined)

```typescript
// commoners.config.ts
export default {
  name: 'my-app',

  // Optional: frontend build adapter (defaults to 'vite')
  adapter: 'vite',

  // Optional: override default service bundlers by extension
  bundlers: { '.go': goBundler, '.zig': zigBundler },

  services: {
    api: goApiService,        // Uses its own declared bundler
    worker: './worker.ts',    // Uses core's esbuild (default)
  },
}
```

No changes needed for existing users. Both fields are optional and default to current behavior.

---

## When to Implement

**Do Phase 1 when:**
- Doing a major refactor of the build system anyway (e.g., Vite 8 migration)
- A user requests non-Vite support

**Do Phase 2 when:**
- Phase 1 is done and a second adapter is being developed

**Do Phase 3 when:**
- A concrete non-Vite adapter is needed and tested

**Do NOT implement if:**
- Vite continues working well and no alternative bundler has compelling advantages
- The abstraction would add complexity without concrete users

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Over-engineering — abstracting without concrete need | High | Only implement Phase 1 as part of other refactors |
| Leaky abstraction — Vite-specific behavior bleeds through | Medium | Keep `raw` escape hatch in AdapterConfig |
| Plugin compat — non-Vite adapters can't implement all hooks | Medium | AdapterPlugin uses minimal hook set; complex behavior stays in Vite adapter |
| Performance — adapter indirection adds latency | Low | Negligible — one function call layer |

---

## Relationship to Other Roadmap Items

- **Vite Evolution (Batch C):** Complementary but separate. Vite 8 plan is about *surviving the upgrade* (test, fix, ship). Build adapter is about *future-proofing*. **Phase 1 of the adapter is a natural refactoring opportunity during the Vite 8 migration** — extract the interface while you're already touching the build files. Keep the documents separate: Vite Evolution tracks the tactical migration, this document tracks the strategic architecture.
- **Build Strategies:** Already use Strategy pattern — adapter is the missing piece for the *bundler* layer (strategies handle *platform* packaging).
- **Tauri/Electron plugins:** These are the hardest to abstract because they hook deep into dev server lifecycle. May remain Vite-specific even with adapter.
- **Service Bundler:** Independent of Vite adapter. Can be implemented before or after the frontend adapter — the two axes are orthogonal.

# Core Package (`@commoners/solidarity`)

## Key Constraints

- **Electron import boundary**: Do NOT import across `assets/electron/` → `utils/`. Inline small utilities instead.
- **Preload**: Bundled as CJS — no top-level await supported.
- **WASM services**: Must be resolved early in `resolveService()`. Do NOT let them go through the full resolution path or they lose the `__wasm` marker.
- **Extensions**: `config.extensions` is the canonical record. `config.plugins` and `config.services` are legacy views with shared object references.
- **`scopedConfig`**: Must preserve `__resolved` flag via `Object.defineProperty`.

## Config Bundling

Config is bundled 3 ways — be aware which properties are stripped per target:
1. **Node.js** (esbuild) — full config for initial resolution
2. **Browser** (Vite/Rollup, `.mjs`) — only `plugins`
3. **Electron** (Vite/Rollup, `.cjs`) — `name`, `icon`, `electron`, `plugins`, `services`, `hooks`

## Service Build Paths

- Dev: `.commoners/.tmp/services/` (`globalTempServiceWorkspacePath`)
- Build: `.commoners/services/` (`globalServiceWorkspacePath`)

## IPC Pattern

Use `invoke`/`handle` for async IPC. `scopedHandle()` is idempotent (calls `removeHandler` before `handle`).

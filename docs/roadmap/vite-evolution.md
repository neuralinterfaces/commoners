# Vite Evolution: Vite 8 Prep + Plugin Refactor

Implementation plan for auditing Rollup/esbuild usage, preparing for the Vite 8 / Rolldown migration, and evaluating a Vite plugin refactor of the build system.

**Timing:** Best timed alongside the Vite 8 release. Track the [Vite 8 RFC](https://github.com/vitejs/vite) for migration guidance.

---

## Problem

Vite 8 will ship with Rolldown as the default bundler, replacing Rollup for production builds and esbuild for development transforms. Commoners uses Rollup-specific plugin hooks, Rollup configuration options, and direct esbuild calls. These need to be audited for compatibility:

1. **Rollup plugin hooks** — Some may behave differently under Rolldown
2. **Rollup configuration options** — `rollupOptions.input`, `rollupOptions.external`, `rollupOptions.output.inlineDynamicImports`
3. **Direct esbuild usage** — SEA bundling, service compilation, and `.node` file handling bypass Vite entirely
4. **Build system refactor** — Some build orchestration could become Vite plugins; some is too complex

---

## Current State: Audit Results

### Rollup Plugin Hooks Used

| Hook | File | Lines | Purpose | Rolldown Compat |
|------|------|-------|---------|-----------------|
| `resolveId()` | `vite/plugins/commoners.ts` | 64-66 | Resolve `commoners:env` and `commoners:wasm` virtual modules | Expected compatible |
| `load()` | `vite/plugins/commoners.ts` | 68-96 | Load virtual module content | Expected compatible |
| `transformIndexHtml()` | `vite/plugins/commoners.ts` | 99-248 | Inject `commoners` global into HTML | Vite-specific hook, not Rollup |
| `closeBundle()` | `vite/plugins/electron/index.ts` | 152-168, 184-186 | Trigger Electron startup after bundle | Expected compatible |
| `config()` | `vite/plugins/electron/index.ts` | 179-182 | Capture user config | Vite-specific hook |
| `configureServer()` | `vite/plugins/electron/index.ts` | 128 | Dev server setup | Vite-specific hook |
| `handleHotUpdate()` | `vite/plugins/commoners.ts` | 110-141 | Plugin hot reload detection | Vite-specific hook |
| `configureServer()` | `vite/plugins/tauri/index.ts` | 46-198 | Spawn `tauri dev` when server is ready | Vite-specific hook |
| `config()` | `vite/plugins/tauri/index.ts` | 203-205 | Set `base: './'` for asset paths | Vite-specific hook |

**Assessment:** All hooks are either Vite-native (`transformIndexHtml`, `config`, `configureServer`, `handleHotUpdate`) or part of Rolldown's Rollup compatibility layer (`resolveId`, `load`, `closeBundle`). **Low risk.**

### Rollup Configuration Options Used

| Option | File | Lines | Purpose | Rolldown Compat |
|--------|------|-------|---------|-----------------|
| `rollupOptions.input` | `vite/index.ts` | 178-181 | Multi-page HTML entry points | Expected compatible |
| `rollupOptions.input` | `utils/assets.ts` | 565-567 | Asset bundling entry | Expected compatible |
| `rollupOptions.output.inlineDynamicImports` | `vite/plugins/electron/index.ts` | 83 | Preload script: inline all imports | Needs verification |
| `rollupOptions.external` | `vite/plugins/electron/inbuilt.ts` | 12-26 | Exclude Node.js builtins + Electron | Expected compatible |
| `rollupOptions.external` | `utils/assets.ts` | 689 | Exclude `os`, `dgram` | Expected compatible |
| `rollupOptions.plugins` | `utils/assets.ts` | 690-692 | `importMetaResolvePlugin()` + `renderChunk` | Needs verification |

**`renderChunk` detail:** `utils/assets.ts` line 975-989 uses a custom `fix-windows-chunk-paths` Rollup plugin with a `renderChunk` hook that fixes absolute paths on Windows. This is part of Rolldown's Rollup compat layer and expected to work.

**`resolveImportMeta` detail:** `utils/esbuild/plugins.ts` line 6 uses a non-standard esbuild hook. When passed through `rollupOptions.plugins`, Rolldown may not recognize it. Test with Vite 8 beta.

**Assessment:** `inlineDynamicImports` is Rollup-specific and may not have a direct Rolldown equivalent. `external` is fundamental and will be supported. **Medium risk** on `inlineDynamicImports` and `resolveImportMeta`.

### Direct esbuild Usage

| Location | Lines | Purpose | Vite 8 Impact |
|----------|-------|---------|---------------|
| `utils/assets.ts` | 589-602 | `buildForBrowser()` / `buildForNode()` for asset compilation | **Independent of Vite** — these are standalone esbuild calls |
| `utils/sea.ts` | 59-69 | SEA (Single Executable Application) bundling | **Independent of Vite** — standalone esbuild call |
| `utils/esbuild/plugins.ts` | 6-43 | `importMetaResolvePlugin()`, `nativeNodeModulesPlugin()` | esbuild-specific plugins; **no Vite 8 impact** |

**Assessment:** All direct esbuild calls are standalone (not going through Vite). Vite 8's internal esbuild→Rolldown migration does NOT affect these. **No risk** unless esbuild itself is deprecated (unlikely near-term).

### Vite Build API Usage

| Location | Purpose |
|----------|---------|
| `vite/plugins/electron/index.ts` line 58 | Build Electron main/preload scripts |
| `flows/BuildFlow.ts` line 256 | Main application build |
| `utils/assets.ts` lines 558, 699 | Asset and bundle compilation |

These all use `vite.build()` which is stable API.

---

## Implementation Plan

### Step 1: Verify `inlineDynamicImports` Under Rolldown

**Goal:** Confirm preload script bundling works with Rolldown.

The Electron preload script requires all dynamic imports to be inlined (single file output). This uses `rollupOptions.output.inlineDynamicImports: true`.

1. Test with Vite 8 beta/RC when available
2. If unsupported, alternatives:
   - Use esbuild for preload bundling (already bundled as CJS)
   - Use Rolldown's `output.format: 'iife'` which inherently inlines
   - Pre-bundle preload with standalone esbuild call (like SEA)

**Files:** `vite/plugins/electron/index.ts`

### Step 2: Verify Rollup Plugin Compatibility Layer

**Goal:** Confirm `resolveId`, `load`, `closeBundle` work in Rolldown.

1. Run existing build with Vite 8 beta
2. Verify virtual modules (`commoners:env`, `commoners:wasm`) resolve correctly
3. Verify `closeBundle` fires after bundle completion
4. Check for any deprecation warnings

**Files:** `vite/plugins/commoners.ts`, `vite/plugins/electron/index.ts`

### Step 3: Audit `rollupOptions.plugins` Usage

**Goal:** Verify custom Rollup plugins work in Rolldown.

`utils/assets.ts` passes `importMetaResolvePlugin()` via `rollupOptions.plugins`. This plugin uses the `resolveImportMeta()` hook which is Vite-specific (not standard Rollup). Verify it works through Rolldown's compat layer.

**Files:** `utils/assets.ts`, `utils/esbuild/plugins.ts`

### Step 4: Evaluate Build System as Vite Plugin

**Goal:** Determine which build behaviors could become Vite plugins vs must remain standalone.

**Candidates for Vite plugin:**
- HTML injection (`transformIndexHtml` — already a Vite plugin hook)
- Virtual module resolution (`resolveId`/`load` — already plugin hooks)
- Service compilation triggering (could be a `buildStart` or `closeBundle` hook)

**Must remain standalone:**
- SEA compilation (esbuild, platform-specific, not a web build)
- Service compilation (multi-language, spawns external tools)
- Electron/Tauri main process bundling (separate build target)
- ASAR integrity (post-build hook, not a Vite concern)
- Mobile build orchestration (Capacitor/Tauri CLI, not Vite)

**Assessment:** The current split is largely correct. The Vite plugin handles web-facing concerns; standalone scripts handle platform-specific builds. A full refactor to "everything is a Vite plugin" would be forced and counterproductive.

### Step 5: Evaluate esbuild Replacement

**Goal:** Determine if standalone esbuild calls should migrate to Rolldown.

| Usage | Recommendation |
|-------|---------------|
| `buildForBrowser()` / `buildForNode()` in `assets.ts` | Keep esbuild — fast, simple, standalone |
| SEA bundling in `sea.ts` | Keep esbuild — CJS + Node target is esbuild's strength |
| `nativeNodeModulesPlugin` | Keep esbuild — `.node` handling is esbuild-specific |

**Assessment:** No compelling reason to replace standalone esbuild usage. These are targeted, fast compilations that don't benefit from Rolldown's features.

---

## Migration Checklist (for Vite 8 Release)

1. [ ] Update `vite` dependency to 8.x
2. [ ] Run full test suite — identify any breakage
3. [ ] Verify virtual modules (`commoners:env`, `commoners:wasm`)
4. [ ] Verify preload `inlineDynamicImports` or apply workaround
5. [ ] Verify `rollupOptions.external` for Node.js builtins
6. [ ] Verify `rollupOptions.plugins` compat layer
7. [ ] Check for deprecated Vite/Rollup APIs in console warnings
8. [ ] Update `vite/plugins/electron/inbuilt.ts` if external resolution changed
9. [ ] Test Electron build+launch end-to-end
10. [ ] Test mobile build (Capacitor) end-to-end

---

## File Inventory

| File | Risk Level | Action Needed |
|------|-----------|---------------|
| `packages/core/vite/plugins/commoners.ts` | Low | Verify hooks under Rolldown |
| `packages/core/vite/plugins/electron/index.ts` | Medium | Verify `inlineDynamicImports`, `closeBundle` |
| `packages/core/vite/plugins/electron/inbuilt.ts` | Low | Verify `external` handling |
| `packages/core/vite/index.ts` | Low | Verify `rollupOptions.input` |
| `packages/core/vite/plugins/tauri/index.ts` | Low | Vite-specific hooks only (`configureServer`, `config`) |
| `packages/core/utils/assets.ts` | Medium | Verify `rollupOptions.plugins` (`renderChunk`, `resolveImportMeta`); esbuild calls unaffected |
| `packages/core/utils/sea.ts` | None | Standalone esbuild; no changes needed |
| `packages/core/utils/esbuild/plugins.ts` | Low | `resolveImportMeta` hook needs testing when passed via `rollupOptions.plugins` |

---

## Dependencies

- **Vite 8 release** — monitor [vitejs/vite](https://github.com/vitejs/vite) for release timeline
- No other roadmap items required as prerequisites
- No other roadmap items blocked by this

---

## Verification

- [ ] Full test suite passes on Vite 8
- [ ] Virtual modules resolve correctly
- [ ] Preload script bundles as single CJS file
- [ ] Electron dev mode hot-reloads correctly
- [ ] Mobile builds work unchanged
- [ ] No Vite deprecation warnings in build output

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| `inlineDynamicImports` unsupported in Rolldown | Use standalone esbuild for preload (already CJS) |
| Rolldown compat layer has subtle differences | Test early with Vite 8 beta; report issues upstream |
| esbuild deprecated in favor of Rolldown | Unlikely near-term; esbuild is independently maintained |
| Premature Vite plugin refactor adds complexity | Keep current architecture; only refactor if Vite 8 provides clear benefits |

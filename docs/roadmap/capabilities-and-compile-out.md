# Capabilities and Compile-Out

**Status:** design, not implemented.

## Problem

An app built with Commoners ships the code for every feature it *could* use on every target, whether or not a given build enables it. Today only the framework's own runtime is trimmed:

- the `__HAS_PLUGINS__`, `__IS_DEV__` and `__IS_DESKTOP__` defines in the onload script;
- per-target stripping of config *properties*.

Nothing removes an app's own disabled features, a disabled plugin's imports, a service that a build does not need, or Tauri plugins that are always compiled in.

For applications that must show exactly what they contain — regulated, audited, or distributed in several editions — "disabled at runtime" is not enough. A feature that is off should be **absent from the shipped artifact, and provably so**.

## Goals

1. **One declaration.** The app declares, per build, which capabilities are enabled. Nothing else needs to know.
2. **Every build site honours it.**
   - the app's Vite bundle
   - the config bundles
   - the onload runtime
   - the Electron main and preload
   - JS/TS services
   - which services and sidecars are built and packaged
   - the Tauri Rust side
3. **Absence is checked on the built output**, not assumed from flags.
4. **No new mechanism where one exists.** Reuse Vite `define` and aliases, Cargo features, Tauri capability files, and the existing `isSupported`.

## Non-goals

- Runtime feature flags or remote configuration. This is a build-time decision.
- Licensing or entitlement enforcement.

## Configuration

```ts
// commoners.config.ts
export default {
  capabilities: {
    // name: enabled for this build (a function receives the target)
    recording: true,
    export: ({ target }) => target !== 'web',
    telemetry: false,
  },

  plugins: {
    exporter: { capability: 'export', /* ... */ },
  },

  services: {
    analytics: { src: './services/analytics.ts', capability: 'telemetry' },
  },
}
```

- A capability can be `true`, `false`, or a function of `{ target, mode }`. It is resolved once, at config resolution.
- Plugins and services may declare the `capability` they belong to. If it is disabled, the extension is excluded entirely.
- An undeclared capability is an error, not "off". Typos must not silently disable code.

## Mechanisms, by build site

| Build site | Mechanism |
|---|---|
| App bundle, config bundles, onload, Electron main/preload, JS services | `define`: `__COMMONERS_CAP_<NAME>__` → `true`/`false`, so `if (__COMMONERS_CAP_EXPORT__) { … }` is dead-code-eliminated. Each build site gets the *same* resolved map. |
| Dynamic imports a define cannot reach | Alias the module to a stub that throws when called: `capabilities.<name>.modules: ['./src/exporter']`. The stub keeps the import graph intact but carries none of the code. |
| Plugins | A plugin whose capability is disabled is never bundled. `isSupported` is applied at **build time** for the target (today only Capacitor plugin selection does this). |
| Services and sidecars | Not built, not copied, no `externalBin` entry, no PyInstaller, cargo or SEA step. |
| Tauri (Rust) | A generated `[features]` table, one feature per capability. The app is built with `--no-default-features --features …`, and plugin registrations sit behind `#[cfg(feature = "…")]`. The generated capability file grants only the permissions of enabled plugins. User Rust plugins (`tauri.plugin`) see the same features. |
| Types | `commoners.capabilities` is available at runtime as a frozen, read-only map for code that must branch. It is defined at build time, so it is also dead-code-eliminated. |

## Proving absence

Each capability may declare **canaries**: strings or symbols that exist only in its code. They default to the declared module paths and service names.

```ts
capabilities: {
  telemetry: { enabled: false, canaries: ['telemetry-endpoint', 'TelemetryClient'] },
}
```

After every build, the output is scanned (JS chunks, HTML, ASAR contents, packaged binaries' string tables):

- **Disabled capabilities:** no canary may appear. Any hit fails the build.
- **Enabled capabilities:** at least one canary must appear. This is the positive control that proves the scan can see the code at all.

The scan runs in the same post-build step as the existing no-eval scan. Its result is written to `commoners.manifest.json` next to the build:

```json
{
  "target": "desktop",
  "capabilities": { "recording": true, "export": true, "telemetry": false },
  "absence": { "telemetry": "verified" },
  "presence": { "recording": "verified", "export": "verified" },
  "services": ["recorder"],
  "modules": { "count": 412, "digest": "sha256-…" }
}
```

The manifest gives a reviewer or CI one file that states what a build contains and how that was checked. Diffing two manifests shows exactly what changed between editions.

## Relationship to what exists

- **`__COMMONERS_TARGET__` and friends:** unchanged. Capabilities are orthogonal to target.
- **Config stripping** removes properties; capabilities remove code. The two run together.
- **`isSupported`:** runtime checks keep working. The new part is honouring it at build time.
- **Tauri capability files:** already generated (services, user plugins). They are narrowed to enabled capabilities.

## Phases

1. **P1: declaration and defines.** Resolve `capabilities`, apply the defines to every bundle, add the runtime map, and make undeclared names an error.
   - *Exit:* a fixture app with a disabled capability builds on web, Electron and Tauri, and a canary scan of its output finds nothing.
2. **P2: exclusion.** Exclude plugins and services by capability, apply build-time `isSupported`, and add module stubs.
   - *Exit:* a disabled service is absent from every package (verified by listing the ASAR and bundle contents).
3. **P3: Tauri features.** Generate `[features]` and `cfg` registration, and narrow the capability files.
   - *Exit:* the Rust binary of a build with a capability disabled contains none of its canaries (`strings` on the binary).
4. **P4: manifest and gate.** Write `commoners.manifest.json`, fail on absence and presence violations, and mutation-test the gate. Re-enabling a disabled capability's code without its flag must fail the build.

## Open questions

1. Should a capability's function form see the full resolved config, or only `{ target, mode }`? The narrower form keeps resolution order simple.
2. Should canaries default to *every* exported symbol of a capability's modules, or only to declared strings? The first catches more but is noisier in minified output.
3. How should the stub for a disabled dynamic import behave: throw on import, or on first use?

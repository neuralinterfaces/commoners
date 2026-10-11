# Demo App

The demo app exercises most commoners features. It's the primary integration test target.

## Commands

- `pnpm demo` — Dev mode (from repo root)
- `pnpm demo:build` — Production build
- `pnpm demo:launch` — Launch built app

## What It Covers

- Multi-language services (JS, Python, C++, Rust, WASM)
- Plugin lifecycle hooks
- Electron desktop builds
- Extension classification (plugins, services, hybrids)

## Config

`commoners.config.ts` in this directory — the most comprehensive config example in the repo. Refer to it as the canonical usage reference.

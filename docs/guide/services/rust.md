# Rust Services

Commoners supports Rust services in two modes: **native** (compiled binary, runs as a child process) and **WASM** (compiled to WebAssembly, runs in the browser).

## Native Rust Services (`CargoService`)

Use `CargoService` for traditional HTTP servers written in Rust. The service compiles with `cargo build` and runs as a native binary.

### Setup

Create a standard Cargo project:

```
src/services/rust/
├── Cargo.toml
└── src/
    └── main.rs
```

**Cargo.toml:**
```toml
[package]
name = "my-service"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "server"
path = "src/main.rs"

[dependencies]
# Your HTTP framework of choice
```

**commoners.config.ts:**
```ts
import { join } from 'node:path'
import * as services from '@commoners/solidarity/services'
import { getDirname } from '@commoners/solidarity/config'

const root = getDirname(import.meta.url)

export default {
  services: {
    ...services.rust.services([
      {
        name: 'rust',
        bin: 'server',           // Cargo binary name
        src: join(root, './src/services/rust/src/main.rs'),
        profile: 'release',     // Cargo profile (default: 'release')
        cargoArgs: '',          // Additional cargo build arguments
      },
    ]),
  },
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | required | Service identifier |
| `src` | `string` | required | Path to the main source file |
| `bin` | `string` | `name` | Cargo binary name |
| `profile` | `string` | `'release'` | Cargo build profile |
| `cargoArgs` | `string` | `''` | Additional cargo arguments |

### How It Works

1. During build, Commoners runs `cargo build --profile <profile>` from the Cargo project root
2. The compiled binary is copied to the build output
3. At runtime, the binary is spawned as a child process with `PORT` and `HOST` environment variables

## WASM Services (`WasmCargoService`)

Use `WasmCargoService` for computation that should run directly in the browser — no server process needed. This is ideal for PWA targets where you can't run a native binary.

### Setup

Create a Cargo library project with `wasm-bindgen`:

```
src/services/rust-wasm/
├── Cargo.toml
└── src/
    └── lib.rs
```

**Cargo.toml:**
```toml
[package]
name = "my-wasm-service"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
```

**src/lib.rs:**
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn echo(input: &str) -> String {
    input.to_string()
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

**commoners.config.ts:**
```ts
import * as services from '@commoners/solidarity/services'

export default {
  services: {
    ...services.wasm.services([
      {
        name: 'rust-wasm',
        src: join(root, './src/services/rust-wasm/src/lib.rs'),
      },
    ]),
  },
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | required | Service identifier |
| `src` | `string` | required | Path to the lib.rs source file |
| `target` | `string` | `'bundler'` | wasm-pack target (`bundler`, `web`, `nodejs`, `no-modules`) |
| `profile` | `string` | `'release'` | Build profile |
| `cargoArgs` | `string` | `''` | Additional arguments |

### How It Works

1. During build, Commoners runs `wasm-pack build --target <target> --release`
2. The output (`.wasm` + JS glue code + TypeScript definitions) is copied to the web assets directory
3. In `commoners.SERVICES`, the WASM service appears with `type: 'wasm'` and a path to the asset
4. Frontend code imports the WASM module directly — no HTTP requests needed

### Frontend Usage

```ts
// WASM services are available in commoners.SERVICES with type: 'wasm'
const wasmService = commoners.SERVICES['rust-wasm']

if (wasmService.type === 'wasm') {
  // Import the WASM module from the asset path
  const wasm = await import(wasmService.url)
  const result = wasm.echo('Hello from WASM!')
}
```

### Prerequisites

- [Rust](https://rustup.rs/) toolchain
- `wasm-pack`: Install via `cargo install wasm-pack` or `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`
- `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`

## Native vs WASM: When to Use Each

| Scenario | Recommendation |
|----------|---------------|
| HTTP API server | Native (`CargoService`) |
| CPU-intensive computation for web | WASM (`WasmCargoService`) |
| Desktop-only service | Native |
| PWA-compatible service | WASM |
| File system access needed | Native |
| Browser-embedded logic | WASM |

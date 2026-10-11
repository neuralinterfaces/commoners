# Troubleshooting

Common issues and solutions when working with Commoners.

## Installation & Setup

### Node version errors

Commoners requires Node.js 20 or later.

```bash
node --version  # Must be >= 20.0.0
```

Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions.

### PNPM workspace issues

Commoners uses PNPM workspaces. If you see resolution errors:

```bash
pnpm install --force
```

If developing on the monorepo itself, always use `pnpm` (not npm or yarn).

## Services

### Python services require conda

Python services use PyInstaller for bundling, which must be available on PATH. The recommended setup:

```bash
conda create -n my-env python=3.11 pyinstaller
conda activate my-env
```

Without conda active, Python service builds will fail with a `DependencyError`.

### C++ services need a compiler

C++ services require `g++` (macOS/Linux) or MSVC (Windows). On macOS:

```bash
xcode-select --install
```

On Linux:

```bash
sudo apt-get install build-essential
```

### Services not reloading in dev mode

In Electron dev mode, service hot-reload is automatic — when you save a service source file, Commoners will stop and restart that service. If a service fails to restart, check the terminal output for errors.

For web target dev mode, services are rebuilt on server restart.

### Port conflicts

Services bind to specific ports. If you see `EADDRINUSE`:

1. Check if another instance is running: `lsof -i :PORT_NUMBER`
2. Kill the orphaned process or change the port in your config
3. Commoners includes automatic port-retry logic, but explicitly configured ports won't auto-reassign

## Desktop (Electron)

### Electron sandbox freezes on Windows

`app.enableSandbox()` causes Electron to freeze on Windows. This is a known upstream issue. Commoners uses per-window `sandbox: true` as a workaround, which functions correctly.

### ASAR integrity verification fails

If you see ASAR hash mismatches after building:

1. Ensure you're not modifying files inside the `.asar` after packaging
2. On macOS, code signing must happen after ASAR creation
3. Run `pnpm build -- --target desktop` for a clean build

### Large desktop app size

Electron bundles Chromium, which adds ~200 MB. This is inherent to Electron-based apps. To minimize size:

- Use `.gitignore`-style patterns in your Electron config to exclude unnecessary files
- Ensure dev dependencies aren't bundled (check your `package.json`)
- Tauri support (planned) will offer ~10 MB desktop builds using the system webview

## Mobile

### iOS builds require macOS

iOS builds and Xcode are only available on macOS. This is an Apple platform restriction. For CI, use macOS runners (e.g., `macos-latest` on GitHub Actions).

### Android SDK not found

Ensure the Android SDK is installed and `ANDROID_HOME` is set:

```bash
export ANDROID_HOME=$HOME/Android/Sdk  # Linux
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
```

### Capacitor sync issues

If mobile builds fail after config changes:

```bash
npx cap sync
```

This regenerates the native project from your web build output.

## Build

### Vite build errors

Commoners uses Vite for frontend bundling. Common issues:

- **Import errors**: Ensure all imports resolve. Commoners externalizes `electron` and `*.node` files automatically.
- **Environment variables**: Use `.env` files or `config.env` in your commoners config. Variables prefixed with `VITE_` are exposed to the frontend.

### Config stripping removes needed properties

If a property you need is missing at runtime, it may have been stripped during config bundling. The browser bundle only includes `plugins` — services, hooks, and Electron config are intentionally excluded for security.

Use compile-time guards to conditionally include code:

```ts
if (__COMMONERS_DESKTOP__) {
  // This code only exists in desktop builds
}
```

## Linux

### FUSE required for AppImage

On Linux, Electron AppImage builds require FUSE:

```bash
sudo apt-get install -y fuse libfuse2
```

## Getting Help

- [GitHub Issues](https://github.com/neuralinterfaces/commoners/issues) — Bug reports and feature requests
- [Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) — Reference project with working CI

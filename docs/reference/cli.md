# CLI Commands

## Global Options

These options work with all commands:

| Flag | Description |
|------|-------------|
| `--target <target>` | Target platform (see below) |
| `--config <path>` | Path to configuration file |
| `--stdin` | Read configuration from STDIN (pipe JSON) |
| `--no-color` | Disable colored output |
| `-L, --log-level <level>` | Set log level: `debug`, `info`, `warn`, `error`, `silent` |

## Commands

### `commoners [root]`

Run your project in development mode. Also available as `commoners dev`, `commoners start`, or `commoners run`.

```bash
commoners                       # Dev server (web)
commoners --target desktop      # Electron dev mode
commoners --target tauri        # Tauri dev mode
```

### `commoners init [root]`

Add Commoners to an existing project. Creates `commoners.config.ts` and adds scripts to `package.json`.

```bash
commoners init                  # Initialize in current directory
commoners init ./my-app         # Initialize in specific directory
```

### `commoners build [root]`

Build the project for production.

```bash
commoners build                         # Web build (default)
commoners build --target desktop        # Electron desktop build
commoners build --target tauri          # Tauri desktop build
commoners build --target mobile         # Mobile (Capacitor)
commoners build --service api           # Build a specific service
commoners build --services              # Rebuild all services
```

| Flag | Description |
|------|-------------|
| `--outDir <path>` | Output directory |
| `--service <name>` | Build specific service(s) |
| `--services` | Force rebuild all services |
| `--publish [type]` | Publish release (`always`, `onTag`, `never`) |
| `--sign` | Enable code signing (desktop on Mac only) |
| `--headless` | Skip opening native IDEs (for CI) |

### `commoners preview [root]`

Preview your built application. Also available as `commoners launch`.

```bash
commoners preview                       # Preview web build
commoners preview --target desktop      # Launch desktop build
commoners preview --service api         # Launch a specific service
```

| Flag | Description |
|------|-------------|
| `--outDir <path>` | Build output directory to preview |
| `--service <name>` | Launch specific service(s) |
| `--port <port>` | Override port (single service only) |
| `--public` | Launch service as public (services only) |

### `commoners share [root]`

Start services and advertise them on the local network via Bonjour/mDNS.

```bash
commoners share                         # Share all services
commoners share --service api           # Share specific service
commoners share --qr                    # Show QR code for mobile testing
```

| Flag | Description |
|------|-------------|
| `--service <name>` | Share specific service(s) |
| `--port <port>` | Override port (single service only) |
| `--meta <kv>` | Add metadata as `key=value` (Bonjour txt records) |
| `--qr` | Display QR code for service URLs |

## Target Platforms

| Target | Description |
|--------|-------------|
| `web` | Web build (default) |
| `pwa` | Progressive Web App (build only) |
| `desktop` | Desktop (defaults to Electron) |
| `electron` | Electron specifically |
| `tauri` | Tauri specifically |
| `mobile` | Mobile (defaults to Capacitor for current OS) |
| `ios` | iOS via Capacitor |
| `android` | Android via Capacitor |
| `ios-tauri` | iOS via Tauri |
| `android-tauri` | Android via Tauri |

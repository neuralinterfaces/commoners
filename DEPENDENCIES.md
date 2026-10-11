# Runtime dependencies

Every package Commoners installs into an app is listed here with the reason it is needed. `tests/dependencies.test.ts` fails when this file and the packages' `package.json` disagree. Adding a runtime dependency means justifying it here, in the same change.

Target-specific tooling is **not** a dependency. Electron, electron-builder and the PWA plugin are optional peer dependencies, installed by apps that build for those targets, so a web-only app does not carry a desktop toolchain. The install-footprint budget in the same test holds that line.

## @commoners/solidarity (core)

- `@electron-toolkit/utils`: Electron main-process helpers (`is.dev`, platform checks) bundled into the packaged app's main process
- `bonjour-service`: mDNS discovery for sharing local services on the network (`commoners share`)
- `boxen`: framed CLI output (the terminal UI lives in core)
- `chalk`: terminal colours for CLI output
- `dotenv`: loads `.env` files for services
- `esbuild`: bundles the config file and JavaScript services
- `figures`: terminal symbols for CLI output
- `js-yaml`: reads electron-builder YAML defaults
- `open`: opens URLs and files in the system browser (launch, desktop commands)
- `ora`: CLI progress spinners
- `path-browserify`: browser polyfill for `path` in config bundles that run in the page
- `plist`: reads and writes macOS Info.plist (ASAR integrity, iOS config)
- `vite`: the build tool and dev server for every target
- `ws`: the dev server's WebSocket channel to running apps
- `xml2js`: edits Android manifests for mobile builds

Optional (installed only if available): `rcedit`, which edits Windows executable resources for ASAR integrity on Windows.

Optional peer dependencies (install for the targets you build): `electron`, `electron-builder`, `electron-builder-squirrel-windows`, `@electron/fuses`, `@electron/notarize` (desktop), `vite-plugin-pwa` (PWA), `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/assets` (mobile).

## commoners (CLI)

- `@commoners/solidarity`: the framework the CLI drives
- `cac`: command-line argument parsing
- `didyoumean2`: "did you mean …" suggestions for mistyped targets
- `qrcode-terminal`: prints a QR code for `commoners share` URLs

## @commoners/testing

- `@commoners/solidarity`: builds and launches the app under test
- `playwright`: drives browsers and the Electron app over CDP
- `vite`: serves the app under test
- `vitest`: the test runner the helpers integrate with

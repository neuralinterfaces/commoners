# Security

Commoners aims to be **secure by default**: in CISA's [Secure by Design](https://www.cisa.gov/securebydesign) terms, protections are on out of the box rather than left for each app to configure. This page lists what is on, per target, and how to check it. It describes Commoners' defaults; it is not a certification, and your app's own security review still applies.

## Controls by target

| Control | Web / PWA | Electron | Tauri |
|---|---|---|---|
| Content Security Policy (inline scripts allowed only by hash; no `eval`) | `<meta>` tag + generated `_headers` for your host | Response header in development and with `electron.origin: 'app'`; `<meta>` tag in packaged `file://` builds | `tauri.conf.json` |
| Build-time scan for `eval`-like code the CSP would block | Yes | Yes | Yes |
| Cross-origin isolation (opt-in: `security.crossOriginIsolation`) | Yes | With `electron.origin: 'app'` | Yes |
| Renderer isolation | n/a | `contextIsolation`, `sandbox`, no Node.js in pages; DevTools off in production | Capabilities, deny by default |
| Navigation | n/a | In-app navigation stays in the app; other links open in the system browser only for `https:`, `http:` and `mailto:` (`electron.security.externalProtocols` to change); new windows are denied | Tauri defaults |
| IPC | n/a | Channels limited to an allowlist generated from your plugins and services | Plugin permissions you declare |
| App bundle integrity | n/a | ASAR integrity, when builds are signed | Not yet (sidecars are ad-hoc signed on macOS; production signing is on the roadmap) |
| Service binaries | n/a | Opt-in: set `electron.security.expectedPublisher` on a signed build, and each executable service's code signature is checked against it before the service starts | Not yet |
| Service worker kill switch | A self-unregistering `sw.js` ships by default | n/a | n/a |

## Electron's security checklist

Electron publishes a [20-item security checklist](https://www.electronjs.org/docs/latest/tutorial/security#checklist-security-recommendations). This is where Commoners stands on each item by default. "Yours" means the item depends on what your app does.

| # | Recommendation | Commoners |
|---|---|---|
| 1 | Only load secure content | Partial: app pages are local; links from secondary windows can load remote pages in that window |
| 2 | No Node.js integration for remote content | Yes: `nodeIntegration` is off |
| 3 | Context isolation in all renderers | Yes |
| 4 | Process sandboxing | Yes |
| 5 | `setPermissionRequestHandler()` in sessions that load remote content | No: not set. Add one if your app loads remote content |
| 6 | Do not disable `webSecurity` | Yes: never disabled |
| 7 | Restrictive Content Security Policy | Yes: `script-src 'self'` plus hashes of inline scripts |
| 8 | No `allowRunningInsecureContent` | Yes: never enabled |
| 9 | No experimental features | Yes: never enabled |
| 10 | No `enableBlinkFeatures` | Yes: never set |
| 11–12 | `<webview>` safeguards | n/a: the `<webview>` tag is not enabled |
| 13 | Limit navigation | Yes: in-app navigation is intercepted and routed |
| 14 | Limit new windows | Yes: `window.open` is denied |
| 15 | No `shell.openExternal` with untrusted content | Yes: only allowed protocols open (`https:`, `http:`, `mailto:` by default) |
| 16 | Current Electron | Yours: Commoners depends on Electron `^40.8.0`; check it against current releases |
| 17 | Validate the IPC `sender` | Partial: channels are checked against an allowlist; the sending frame is not |
| 18 | Prefer a custom protocol over `file://` | Opt-in: `electron.origin: 'app'` |
| 19 | Check which fuses to change | Partial: with ASAR integrity, `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` are set; `RunAsNode`, `NODE_OPTIONS` and inspector fuses are not yet |
| 20 | Do not expose Electron APIs to untrusted content | Yes: the preload exposes a scoped Commoners API via `contextBridge`, not `ipcRenderer` |

## Checking it

- `commoners verify-headers <url>` compares a deployment's response headers with what your config declares.
- Every production build writes a [build record](./config.md#build-record): a CycloneDX SBOM of what shipped and a manifest that records these security settings, the enabled features, and file hashes.

## Packaged Electron: `file://` vs `app://`

By default, packaged Electron pages load from `file://`. That origin cannot carry response headers, so the CSP is delivered as a `<meta>` tag. Script in a `file://` page can also `fetch()` local files the user can read. Setting `electron.origin: 'app'` serves pages from `app://local`, with headers on every response and nothing served from outside the app. See [`electron.origin`](./config.md#electron-origin).

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than in a public issue.

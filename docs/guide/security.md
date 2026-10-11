# Security

Commoners aims to be **secure by default**: in CISA's [Secure by Design](https://www.cisa.gov/securebydesign) terms, protections are on out of the box rather than left for each app to configure. This page lists what is on, per target, and how to check it. It describes Commoners' defaults; it is not a certification, and your app's own security review still applies.

## Controls by target

| Control | Web / PWA | Electron | Tauri |
|---|---|---|---|
| Content Security Policy (inline scripts allowed only by hash; no `eval`) | `<meta>` tag + generated `_headers` for your host | Response header in development and with `electron.origin: 'app'`; `<meta>` tag in packaged `file://` builds | `tauri.conf.json` |
| Build-time scan for `eval`-like code the CSP would block | Yes | Yes | Yes |
| Cross-origin isolation (opt-in: `security.crossOriginIsolation`) | Yes | With `electron.origin: 'app'` | Yes |
| Renderer isolation | n/a | `contextIsolation`, `sandbox`, no Node.js in pages; DevTools off in production | Capabilities, deny by default |
| Navigation | n/a | External links open in the system browser; new windows are denied | Tauri defaults |
| IPC | n/a | Channels limited to an allowlist generated from your plugins and services | Plugin permissions you declare |
| App bundle integrity | n/a | ASAR integrity, when builds are signed | Not yet (sidecars are ad-hoc signed on macOS; production signing is on the roadmap) |
| Service binaries | n/a | Signed builds check each executable service's code signature against the expected publisher before it starts | Not yet |
| Service worker kill switch | A self-unregistering `sw.js` ships by default | n/a | n/a |

## Checking it

- `commoners verify-headers <url>` compares a deployment's response headers with what your config declares.
- Every production build writes a [build record](./config.md#build-record): a CycloneDX SBOM of what shipped and a manifest that records these security settings, the enabled features, and file hashes.

## Packaged Electron: `file://` vs `app://`

By default, packaged Electron pages load from `file://`. That origin cannot carry response headers, so the CSP is delivered as a `<meta>` tag. Script in a `file://` page can also `fetch()` local files the user can read. Setting `electron.origin: 'app'` serves pages from `app://local`, with headers on every response and nothing served from outside the app. See [`electron.origin`](./config.md#electron-origin).

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than in a public issue.

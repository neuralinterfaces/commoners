# Platform Abstraction Plugins (DONE)

> This document originally described the design for `commoners.storage`. The design was implemented as two separate plugins — `@commoners/preferences` (key-value settings) and `@commoners/storage` (file access) — plus four additional platform abstractions.

## Implemented Plugins

| Plugin | Purpose | Web | Electron | Mobile |
|--------|---------|-----|----------|--------|
| `@commoners/preferences` | Key-value settings | IndexedDB | Node fs (JSON in userData) | @capacitor/preferences |
| `@commoners/storage` | File read/write | File System Access API | Node fs | @capacitor/filesystem |
| `@commoners/clipboard` | Text + image clipboard | navigator.clipboard | electron.clipboard | @capacitor/clipboard |
| `@commoners/notifications` | Native notifications | Notification API | Electron Notification | @capacitor/local-notifications |
| `@commoners/context` | App paths, info, locale | navigator/globals | app.getPath() | @capacitor/app + device |
| `@commoners/messaging` | Cross-window events | BroadcastChannel | IPC relay | BroadcastChannel |

## Why Two "Storage" Plugins?

- **Preferences** = small key-value pairs (theme, language, user settings). Like `localStorage` or Android `SharedPreferences`.
- **Storage** = actual files (reports, exports, data files). Like `fs.readFile` or Capacitor `Filesystem`.

This matches platform conventions: Capacitor renamed `@capacitor/storage` to `@capacitor/preferences` in v5 for this exact reason.

## OPFS Decision

OPFS (Origin Private File System) was considered for the web backend but rejected:
- Not supported in Safari iOS or mobile WebViews (breaks Capacitor apps)
- Not supported in Android WebView
- IndexedDB is equally capable for key-value in Chrome
- Electron and Tauri have better native alternatives

OPFS could be added as an optional backend for Chrome-only apps needing high-performance file access (e.g., SQLite-over-OPFS) in the future.

## Status

All six plugins are implemented but **untested in real applications**. Validation with Neurotique and demo projects is the next step. See the [plugin README](../../packages/plugins/README.md) for the full support matrix.

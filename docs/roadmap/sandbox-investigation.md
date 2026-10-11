# Electron Sandbox Mode Investigation

## Status: Deferred (sandbox disabled)

## Problem
`app.enableSandbox()` freezes the Electron main process event loop on Windows when `BrowserWindow.loadURL()` is called. No webContents events fire (`did-start-loading`, `dom-ready`, etc.), `setTimeout` callbacks never execute, and Promise `.then()` chains never resolve. The Electron process remains alive (CDP is reachable) but the main thread is completely deadlocked.

## Current Workaround
Sandbox is applied **per-window** via `webPreferences.sandbox` (set through `getWebPreferencesSecuritySettings()`) instead of globally via `app.enableSandbox()`. This provides renderer-process sandboxing without the Windows freeze.

## Root Cause (needs investigation)
- Electron 40+ on Windows 11
- `app.enableSandbox()` is called before `app.whenReady()` (as required), but still causes deadlock
- The `--no-sandbox` CLI flag is also passed to the Electron process (potential conflict?)
- May be related to Chromium's sandbox broker process on Windows failing to initialize

## Impact
- Per-window sandbox via `webPreferences.sandbox` provides equivalent security for renderer processes
- The main difference is that `app.enableSandbox()` also sandboxes utility processes and the GPU process
- For most applications, per-window sandbox is sufficient

## Tasks
1. Investigate whether `--no-sandbox` CLI flag conflicts with `app.enableSandbox()`
2. Test with Electron 41+ to see if the freeze is version-specific
3. File upstream Electron bug if reproducible with a minimal case
4. Consider conditional `app.enableSandbox()` (skip on Windows if per-window sandbox is set)
5. Add automated regression test that verifies sandbox behavior on all platforms

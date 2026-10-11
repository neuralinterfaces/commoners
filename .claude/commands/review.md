Review the current uncommitted changes (or the last commit if clean) against project conventions.

Check for:
1. **Security**: No hardcoded secrets, no command injection, no XSS vectors
2. **Architecture**: No imports across the `assets/electron/` → `utils/` boundary; WASM services don't go through full `resolveService` path
3. **Testing**: Changes to core logic should have corresponding test coverage
4. **Style**: Follows Prettier config (2 spaces, single quotes, no semicolons, 100 char width)
5. **Extensions system**: Uses `config.extensions` as canonical record, not legacy `plugins`/`services` directly
6. **Electron**: Preload has no top-level await; IPC uses `invoke`/`handle` pattern

Report findings grouped by severity: blocking, warning, suggestion.

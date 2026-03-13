# ASAR Integrity Hardening

Implementation plan for completing ASAR integrity validation across macOS and Windows, including sandbox compatibility.

---

## Problem

Electron's ASAR integrity feature embeds cryptographic hashes into the application binary so the runtime can verify that `app.asar` hasn't been tampered with. Commoners has ~2,000 lines of infrastructure for this in `packages/core/utils/asar/`, but platform-specific issues prevent it from working reliably in production:

1. **macOS:** Code signing may invalidate the embedded hash (the plist is modified after signing). electron-builder 26.x may have resolved this — needs verification before deep-diving.
2. **Windows:** The FFI-based resource writing (`ffi-napi`) has Node.js native module compatibility issues across architectures. `rcedit` is a more reliable fallback but is currently second-priority.
3. **Sandbox:** Context isolation + sandbox mode on Windows has not been tested with ASAR integrity enabled.

---

## Current State

### File Inventory (`packages/core/utils/asar/`)

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `security.ts` | 599 | Main orchestration: `makeAfterPackEmbedAsarIntegrity()`, `afterPackFlipFuses()` | Functional but allows silent failures |
| `debug.ts` | 451 | State tracking: `logAsarState()` at build checkpoints | Complete |
| `windows-ffi.ts` | 431 | FFI + rcedit fallback for embedding integrity into `.exe` | FFI unreliable; rcedit fallback exists but is second-priority |
| `hooks.ts` | 141 | electron-builder hook chaining (`chainAfterPack`, `chainAfterSign`, etc.) | Complete |
| `macos-plist.ts` | 126 | Plist read/write for `ElectronAsarIntegrity` key | Functional; post-signing hash mismatch unverified on eb26 |
| `platform.ts` | 114 | OS detection, executable discovery, unpacked dir location | Hardcoded patterns for unpacked dirs |
| `dependencies.ts` | 78 | Checks `ffi-napi`, `rcedit`, `plist`, `@electron/fuses` importability | No version/arch validation |
| `hash.ts` | 59 | SHA256 of ASAR header bytes | Inconsistent header parsing vs `debug.ts` |

### Known Issues

- `security.ts` lines 402-407 and 543-547: builds continue silently if integrity embedding fails
- `hash.ts` reads only 16 bytes for JSON header without validating actual ASAR prelude size (12-byte structure)
- `readIntegrityResource()` in `windows-ffi.ts` returns empty array on failure rather than throwing
- NSIS installer artifact: embedding into `win-unpacked` doesn't affect the already-created installer (line 281 warning)

---

## Implementation Plan

### Step 1: Verify macOS on electron-builder 26.x

**Goal:** Determine if upgrading to `electron-builder@^26.8.1` fixed the post-signing hash mismatch.

1. Create a minimal test: build a signed macOS app with ASAR integrity enabled
2. Verify the hash in `Info.plist` matches the actual `app.asar` after code signing
3. If fixed: document and close. If not: investigate whether `afterSign` hook timing can re-embed the hash

**Files:** `macos-plist.ts`, `security.ts` (afterSign hook chain)

### Step 2: Make `rcedit` the primary Windows strategy

**Goal:** Replace `ffi-napi` as the first-choice Windows resource writer.

1. In `windows-ffi.ts`, swap the priority: try `rcedit` first, fall back to FFI
2. Validate `rcedit` can write and read back the integrity resource correctly
3. Add architecture detection to `dependencies.ts` — warn if FFI native module arch doesn't match target
4. Consider removing FFI path entirely if `rcedit` proves reliable across all Windows targets

**Files:** `windows-ffi.ts`, `dependencies.ts`

### ~~Step 3: Fix hash calculation inconsistency~~ (done)

Both `hash.ts` (lines 22-34) and `debug.ts` (lines 66-93) already use identical 12-byte ASAR prelude parsing with `len0`/`headerSize`/`jsonLen` validation. No code change needed — verified correct.

### ~~Step 4: Fail builds on integrity embedding failure~~ (done)

`strict` parameter already implemented in `makeAfterPackEmbedAsarIntegrity()` at `security.ts` line 207. Defaults to `true`; throws on embedding failure. Opt-out available via config.

### Step 5: Windows sandbox testing

**Goal:** Verify ASAR integrity works with `contextIsolation: true` and `sandbox: true`.

1. Create a test configuration with full sandbox mode enabled
2. Build and launch on Windows; verify the app starts and integrity is validated
3. Document any CSP or permission issues that arise

**Files:** `security.ts`, `ElectronBuildStrategy.ts`

### Step 6: CI verification job

**Goal:** Automated verification that ASAR integrity is correctly embedded.

1. Add a CI job that builds a signed (or self-signed) app on each platform
2. Extract and verify the embedded hash matches the actual ASAR
3. Run on `workflow_dispatch` (expensive) with periodic scheduled runs

**Files:** `.github/workflows/` (new or extended)

---

## Dependencies

- electron-builder `^26.8.1` (already upgraded)
- `@electron/fuses` `^2.1.0` (already present)
- `rcedit` (already a dependency; needs promotion to primary)
- No external blockers

---

## Verification

- [ ] macOS: signed app launches with ASAR integrity fuse enabled
- [ ] Windows: `rcedit`-embedded hash validates on app startup
- [ ] Windows sandbox: app launches with `contextIsolation: true` + `sandbox: true`
- [ ] CI: automated build-and-verify job passes on macOS and Windows (macOS: `ci-verify-asar-integrity.sh` ready; Windows pending)
- [x] Hash inconsistency fixed: `hash.ts` and `debug.ts` use same prelude parsing (verified — both use 12-byte prelude)
- [x] Strict mode implemented: `makeAfterPackEmbedAsarIntegrity()` defaults to `strict: true`

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| macOS issue persists after eb26 | Investigate `afterSign` re-embedding; worst case, disable integrity on macOS temporarily |
| Removing FFI breaks edge cases | Keep FFI as opt-in fallback behind a flag |
| Strict mode breaks existing builds | Default to strict but provide escape hatch via config |
| CI signing costs | Use self-signed certificates for CI; real signing in release workflow only |

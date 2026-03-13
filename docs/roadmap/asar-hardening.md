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

### ~~Step 1: Verify macOS on electron-builder 26.x~~ (done)

**Goal:** Determine if upgrading to `electron-builder@^26.8.1` fixed the post-signing hash mismatch.

Verified: ad-hoc code signing (`codesign --sign -`) does NOT modify `Info.plist` contents, so the embedded ASAR hash survives signing. Integration test added in `tests/asar.test.ts` (macOS-only). `ElectronBuildStrategy.configureCodeSigning()` now falls back to ad-hoc signing (`mac.identity = '-'`) when no Apple Developer certificates are available, enabling ASAR integrity testing without real certificates.

**Files:** `macos-plist.ts`, `security.ts`, `ElectronBuildStrategy.ts`, `tests/asar.test.ts`

### ~~Step 2: Make `rcedit` the primary Windows strategy~~ (done)

**Goal:** Replace `ffi-napi` as the first-choice Windows resource writer.

Code already uses rcedit first (lines 356-381 in `windows-ffi.ts`) with FFI as fallback (lines 383-407). Fixed misleading comments and log messages that said the opposite. Added `detectArchitectureMismatch()` to `windows-ffi.ts` and integrated it into `checkDependencies()` in `dependencies.ts` with optional `targetArch` parameter. Fixed 6 misleading log messages in `security.ts` to accurately describe rcedit as primary and FFI as fallback.

**Remaining (Windows-only):** Real rcedit/FFI integration testing, architecture mismatch detection on actual Windows, end-to-end `writeIntegrityResource` on real `.exe`.

**Files:** `windows-ffi.ts`, `dependencies.ts`, `security.ts`, `tests/security.test.ts`

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

### ~~Step 6: CI verification job~~ (done)

**Goal:** Automated verification that ASAR integrity is correctly embedded.

Implemented: `desktop-build.yml` now runs ad-hoc signed builds on macOS push events and uses the full `ci-verify-asar-integrity.sh` script to validate ASAR integrity (hash match, plist structure, fuse sentinel). Windows verification pending.

**Files:** `.github/workflows/desktop-build.yml`, `tests/asar/ci-verify-asar-integrity.sh`

---

## Dependencies

- electron-builder `^26.8.1` (already upgraded)
- `@electron/fuses` `^2.1.0` (already present)
- `rcedit` (already a dependency; needs promotion to primary)
- No external blockers

---

## Verification

- [x] macOS: ad-hoc signed app preserves ASAR integrity hash (integration test in `tests/asar.test.ts`)
- [x] CI: automated build-and-verify job passes on macOS (ad-hoc signing + `ci-verify-asar-integrity.sh`)
- [ ] macOS: fully signed app launches with ASAR integrity fuse enabled (requires Apple Developer cert)
- [ ] Windows: `rcedit`-embedded hash validates on app startup
- [ ] Windows sandbox: app launches with `contextIsolation: true` + `sandbox: true`
- [ ] CI: Windows automated build-and-verify job
- [x] Hash inconsistency fixed: `hash.ts` and `debug.ts` use same prelude parsing (verified — both use 12-byte prelude)
- [x] Strict mode implemented: `makeAfterPackEmbedAsarIntegrity()` defaults to `strict: true`
- [x] Test verification scripts fixed: `tests/asar/verify.ts` and `ci-verify-asar-integrity.sh` now use correct 12-byte prelude parsing (matching `hash.ts`)
- [x] ASAR unit tests: `tests/asar.test.ts` — 17 tests covering hash computation, prelude parsing, plist round-trip, and regression against old 16-byte bug

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| macOS issue persists after eb26 | Investigate `afterSign` re-embedding; worst case, disable integrity on macOS temporarily |
| Removing FFI breaks edge cases | Keep FFI as opt-in fallback behind a flag |
| Strict mode breaks existing builds | Default to strict but provide escape hatch via config |
| CI signing costs | Use self-signed certificates for CI; real signing in release workflow only |

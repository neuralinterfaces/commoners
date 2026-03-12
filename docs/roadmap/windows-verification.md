# Windows Verification Checklist

Single reference document for verifying Commoners on Windows. Covers build pipeline, code signing, and known platform gaps.

---

## Prerequisites

- Node.js >= 20, pnpm installed
- Branch: `dev` (ensure latest changes pulled)
- For signed builds: a `.pfx` certificate (self-signed is fine for testing)

---

## 1. Basic Build Pipeline

```powershell
pnpm install
pnpm build
```

Verify all packages compile without errors on Windows.

## 2. Fast Tests

```powershell
pnpm test:config
pnpm test:env
```

These should pass identically to macOS (3 + 32 tests).

## 3. Unsigned Desktop Build

```powershell
pnpm exec commoners build --target desktop
```

Expected: produces `.exe` in `.commoners/electron/` without signing errors.

## 4. Certificate Validation Error

```powershell
pnpm exec commoners build --target desktop --sign
```

Expected (without env vars set): clear error message:
> Windows code signing requested but no certificate found. Set WIN_CSC_LINK (or CSC_LINK) to the path or URL of your .pfx certificate file.

## 5. Self-signed Certificate Build

Generate a test certificate:

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Commoners Test"
$pwd = ConvertTo-SecureString -String "test1234" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\test-cert.pfx" -Password $pwd
```

Build with signing:

```powershell
$env:WIN_CSC_LINK = ".\test-cert.pfx"
$env:WIN_CSC_KEY_PASSWORD = "test1234"
pnpm exec commoners build --target desktop --sign
```

Expected: signed `.exe` produced. Verify with:

```powershell
signtool verify /pa .commoners\electron\*.exe
```

## 6. ASAR Integrity

If the signed build succeeds, verify `rcedit` was used to embed integrity hashes. Check the build log for:
> rcedit integrity resource written successfully

## 7. Launch Built App

Run the built `.exe` and confirm:
- App starts without integrity or module errors
- Services connect (if applicable)

---

## Known Windows Gaps

These are non-blocking issues documented for future work. None prevent shipping.

### Port ownership verification (minor)

**File:** `packages/core/assets/services/index.ts` (lines 600-616)

The dev server uses `lsof` to verify which process owns a port before connecting. This is skipped on Windows (`process.platform !== 'win32'` guard), so Windows users don't get the "port owned by unexpected process" warning. The testing package (`packages/testing/src/index.ts`) already has the correct `netstat -ano` fallback — the same pattern could be ported to the dev server if needed.

**Impact:** Diagnostic warning missing on Windows. No functional impact.

### SEA blob injection (minor)

**File:** `packages/core/utils/sea.ts`

Single Executable Application builds use `chmodSync()` (no-op on Windows, harmless) and assume `signtool` is available (requires Windows SDK). This only affects the SEA feature, not standard Electron builds.

**Impact:** SEA builds may need manual signing step on Windows. Standard Electron builds are unaffected.

### Service echo tests require toolchains

Tests for Python (`basic-python`, `numpy`), C++ (`cpp`), and Rust (`rust`) service echo are automatically skipped if the corresponding toolchain (`python`/`python3`, `g++`, `cargo`) is not on PATH. This was fixed in the Windows compatibility commit — the `hasCommand()` guard in `tests/utils.ts` handles it gracefully.

**Impact:** None. Tests self-skip rather than fail.

---

## Related Documents

- [Desktop Targets — Windows](../guide/targets/desktop.md#windows) — signing docs, env vars, config examples
- [Build Automation](../guide/build-automation.md) — CI workflow templates for Windows
- [ASAR Integrity Hardening](./asar-hardening.md) — deeper rcedit/FFI analysis
- [Features Roadmap](./features.md) — overall project status

# ASAR Integrity Testing

Test suite for verifying ASAR integrity protection in Electron applications built with Commoners.

## Overview

ASAR integrity protection prevents tampering with your application's packaged code by:
- Embedding a cryptographic hash of the ASAR archive in the application metadata
- Validating the ASAR contents at runtime before execution
- Causing the app to fail if tampering is detected

These tests verify that ASAR integrity is properly configured and functional.

## Test Scripts

### 1. `verify-asar-integrity.sh` - Interactive Verification

Comprehensive verification script with detailed output and color-coded results.

**Usage:**
```bash
# macOS
./verify-asar-integrity.sh /path/to/YourApp.app

# Windows (limited support - see Windows section)
./verify-asar-integrity.sh /path/to/YourApp.exe
```

**What it checks:**
- ✅ ASAR file exists
- ✅ ElectronAsarIntegrity metadata is present
- ✅ Hash is correctly embedded in Info.plist (macOS) or version info (Windows)
- ✅ Hash computation matches (JSON header or full header mode)
- ✅ Electron fuse sentinel is present in binary

**Output:** Detailed, human-readable results with success/error/warning indicators.

---

### 2. `ci-verify-asar-integrity.sh` - CI/CD Verification

Automated verification for build pipelines with structured exit codes.

**Usage:**
```bash
# Standard mode
./ci-verify-asar-integrity.sh /path/to/YourApp.app

# Strict mode (warnings fail the build)
STRICT_MODE=true ./ci-verify-asar-integrity.sh /path/to/YourApp.app
```

**Exit codes:**
- `0` - Success (all checks passed)
- `1` - Verification failed (integrity not configured correctly)
- `2` - Configuration error (invalid arguments, missing app)

**Environment variables:**
- `STRICT_MODE` - Set to `true` to treat warnings as errors

---

### 3. `tamper-test.sh` - Runtime Validation Test

Proves that integrity validation is active by tampering with a test copy and attempting to launch it.

**Usage:**
```bash
./tamper-test.sh /path/to/YourApp.app
```

**What it does:**
1. Creates a temporary copy of the app
2. Verifies the integrity hash matches
3. Tampers with the ASAR by appending data
4. Attempts to launch the tampered app
5. Checks if the app crashes (proving validation is active)

**Expected result:** App should crash or fail to launch when tampered.

---

### 4. `test-asar-tamper.sh` - Alternative Tamper Test

Similar to `tamper-test.sh` with slightly different implementation.

**Usage:**
```bash
./test-asar-tamper.sh /path/to/YourApp.app
```

---

### 5. `run-all-tests.sh` - Complete Test Suite

Runs all verification and tamper tests in sequence.

**Usage:**
```bash
./run-all-tests.sh /path/to/YourApp.app
```

## Platform-Specific Instructions

### macOS

All scripts work natively on macOS. Required tools (included by default):
- `plutil` - For reading Info.plist
- `shasum` - For hash computation
- `hexdump` - For binary inspection
- `dd` - For extracting ASAR header

**Example:**
```bash
# Verify demo app
./verify-asar-integrity.sh tests/demo/build/Commoners\ Test\ App.app

# Run full test suite
./run-all-tests.sh tests/demo/build/Commoners\ Test\ App.app
```

### Windows

Windows support is limited in these bash scripts. For Windows verification:

1. **Using WSL/Git Bash:**
   ```bash
   ./verify-asar-integrity.sh /c/path/to/YourApp.exe
   ```
   Note: Full verification requires Windows-native tools

2. **Manual Verification (PowerShell):**
   ```powershell
   # Check version info for ElectronAsarIntegrity
   (Get-Item "C:\path\to\YourApp.exe").VersionInfo

   # Or using rcedit
   rcedit "C:\path\to\YourApp.exe" --get-version-string ElectronAsarIntegrity
   ```

3. **Recommended:** Use `ci-verify-asar-integrity.sh` on macOS builds, which includes Windows detection and appropriate messaging.

### Linux

Scripts should work on Linux with standard GNU tools. May require adjusting:
- `stat` commands (use `stat -c%s` instead of `stat -f%z`)
- Binary inspection methods

**Example adaptation:**
```bash
# Linux-compatible file size check
ASAR_SIZE=$(stat -c%s "$ASAR_PATH")
```

## Integration Examples

### GitHub Actions

```yaml
- name: Verify ASAR Integrity (macOS)
  if: runner.os == 'macOS'
  run: |
    chmod +x tests/asar/ci-verify-asar-integrity.sh
    STRICT_MODE=true tests/asar/ci-verify-asar-integrity.sh "build/MyApp.app"

- name: Verify ASAR Integrity (Windows)
  if: runner.os == 'Windows'
  shell: pwsh
  run: |
    # Add Windows-specific verification here
    # Or skip with warning
    Write-Warning "ASAR verification on Windows requires custom tooling"
```

### CircleCI

```yaml
- run:
    name: Verify ASAR Integrity
    command: |
      chmod +x tests/asar/ci-verify-asar-integrity.sh
      tests/asar/ci-verify-asar-integrity.sh "dist/MyApp.app"
```

### Pre-release Script

```bash
#!/bin/bash
# Add to package.json scripts:
# "prerelease": "./scripts/verify-build.sh"

set -e

echo "Verifying macOS build..."
./tests/asar/ci-verify-asar-integrity.sh "dist/mac/MyApp.app"

echo "Verifying Windows build..."
# Add Windows verification

echo "Running tamper test..."
./tests/asar/tamper-test.sh "dist/mac/MyApp.app"

echo "✅ All integrity checks passed!"
```

## Troubleshooting

### Hash Mismatch

If you see "Hash mismatch" errors:

1. **Check hash mode:** ASAR integrity can use JSON header (16 bytes) or full header mode
2. **Verify build process:** Ensure the hash is computed and embedded correctly during build
3. **Check for modifications:** Ensure nothing modifies the ASAR after the hash is computed

### App Still Runs When Tampered

If the tamper test shows the app running despite tampering:

1. **Verify Electron fuses:** Check that `@electron/fuses` is configured correctly
2. **Check Electron version:** ASAR integrity requires Electron 30+
3. **Verify Info.plist:** Ensure ElectronAsarIntegrity is properly embedded
4. **Review build logs:** Look for warnings during the build process

### Missing Tools

If scripts fail due to missing tools:
- **macOS:** All tools should be pre-installed
- **Windows:** Use WSL or Git Bash, or create PowerShell equivalents
- **Linux:** Install coreutils, hexdump, shasum

## Technical Details

### Hash Computation

The integrity hash can be computed in two modes:

1. **JSON Header Mode (Electron 30.0 - 30.4):**
   ```bash
   dd if=app.asar bs=16 count=1 | shasum -a 256
   ```

2. **Full Header Mode (Electron 31+):**
   ```bash
   # Extract header size from first 8 bytes
   HEADER_SIZE=$(dd if=app.asar bs=1 count=8 | od -An -tu4 | awk '{print $1 + $2 + 8}')
   dd if=app.asar bs=1 count=$HEADER_SIZE | shasum -a 256
   ```

### Metadata Embedding

- **macOS:** Hash stored in `Info.plist` under `ElectronAsarIntegrity.hash`
- **Windows:** Hash stored in version info string resource `ElectronAsarIntegrity`
- **Linux:** Implementation varies by distribution method

### Exit Codes

All scripts follow this convention:
- `0` - Success
- `1` - Verification/test failed
- `2` - Configuration/usage error

## References

- [Electron ASAR Integrity Documentation](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- Commoners security utilities: `packages/core/utils/asar/`

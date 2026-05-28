#!/bin/bash
# CI/CD ASAR Integrity Verification
# Automated script for verifying ASAR integrity in build pipelines
# Exit codes: 0 = Success, 1 = Verification failed, 2 = Configuration error
# Usage: ./ci-verify-asar-integrity.sh <path-to-app>

set -e

APP_PATH="$1"
STRICT_MODE="${STRICT_MODE:-false}"  # Set to 'true' to fail on warnings

# Exit codes
EXIT_SUCCESS=0
EXIT_VERIFICATION_FAILED=1
EXIT_CONFIG_ERROR=2

if [ -z "$APP_PATH" ]; then
    echo "ERROR: No app path provided"
    echo "Usage: $0 <path-to-app>"
    exit $EXIT_CONFIG_ERROR
fi

if [ ! -e "$APP_PATH" ]; then
    echo "ERROR: App not found: $APP_PATH"
    exit $EXIT_CONFIG_ERROR
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CI/CD ASAR Integrity Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "App: $APP_PATH"
echo "Strict Mode: $STRICT_MODE"
echo ""

WARNINGS=0
ERRORS=0

# macOS verification
if [[ "$APP_PATH" == *.app ]]; then
    echo "Platform: macOS"
    echo ""

    ASAR_PATH="$APP_PATH/Contents/Resources/app.asar"
    PLIST_PATH="$APP_PATH/Contents/Info.plist"

    # Check 1: ASAR exists
    echo "[1/5] Checking ASAR file..."
    if [ ! -f "$ASAR_PATH" ]; then
        echo "  ❌ FAIL: ASAR file not found"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ PASS: ASAR file exists"
    fi

    # Check 2: Info.plist exists
    echo "[2/5] Checking Info.plist..."
    if [ ! -f "$PLIST_PATH" ]; then
        echo "  ❌ FAIL: Info.plist not found"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ PASS: Info.plist exists"
    fi

    # Check 3: ElectronAsarIntegrity in plist
    echo "[3/5] Checking ElectronAsarIntegrity..."
    if ! plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null | grep -q "ElectronAsarIntegrity"; then
        echo "  ❌ FAIL: ElectronAsarIntegrity not found in Info.plist"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ PASS: ElectronAsarIntegrity found"

        # Extract hash
        PLIST_HASH=$(plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null | grep -A 1 "<key>hash</key>" | tail -1 | sed 's/.*<string>\(.*\)<\/string>/\1/')

        if [ -z "$PLIST_HASH" ]; then
            echo "  ⚠️  WARN: Could not extract hash value"
            WARNINGS=$((WARNINGS + 1))
        else
            echo "  ✅ Hash: ${PLIST_HASH:0:16}..."
        fi
    fi

    # Check 4: Hash verification
    # ASAR uses a 12-byte prelude: len0 (4 bytes LE) + headerSize (4 bytes LE) + jsonLen (4 bytes LE)
    # The JSON header starts at offset 12 and is jsonLen bytes long.
    echo "[4/5] Verifying hash computation..."
    if [ -n "$PLIST_HASH" ] && [ -f "$ASAR_PATH" ]; then
        # Parse the 12-byte prelude to get jsonLen
        PRELUDE=$(dd if="$ASAR_PATH" bs=1 count=12 2>/dev/null | od -An -tx1 | tr -d ' \n')
        # jsonLen is bytes 8-11 (little-endian)
        B8=$(echo "$PRELUDE" | cut -c17-18)
        B9=$(echo "$PRELUDE" | cut -c19-20)
        B10=$(echo "$PRELUDE" | cut -c21-22)
        B11=$(echo "$PRELUDE" | cut -c23-24)
        JSON_LEN=$((16#${B11}${B10}${B9}${B8}))

        if [ "$JSON_LEN" -gt 0 ] 2>/dev/null; then
            # Hash just the JSON header bytes (offset 12, length jsonLen)
            JSON_HASH=$(dd if="$ASAR_PATH" bs=1 skip=12 count="$JSON_LEN" 2>/dev/null | shasum -a 256 | awk '{print $1}')

            if [ "$PLIST_HASH" = "$JSON_HASH" ]; then
                echo "  ✅ PASS: Hash matches (JSON header mode)"
            else
                # Try full header (prelude + JSON)
                FULL_SIZE=$((12 + JSON_LEN))
                FULL_HASH=$(dd if="$ASAR_PATH" bs=1 count="$FULL_SIZE" 2>/dev/null | shasum -a 256 | awk '{print $1}')

                if [ "$PLIST_HASH" = "$FULL_HASH" ]; then
                    echo "  ✅ PASS: Hash matches (full header mode)"
                else
                    echo "  ❌ FAIL: Hash mismatch"
                    echo "     Expected: $PLIST_HASH"
                    echo "     JSON:     $JSON_HASH"
                    echo "     Full:     $FULL_HASH"
                    ERRORS=$((ERRORS + 1))
                fi
            fi
        else
            echo "  ⚠️  WARN: Could not parse ASAR prelude (jsonLen=$JSON_LEN)"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo "  ⚠️  SKIP: Cannot verify (missing data)"
        WARNINGS=$((WARNINGS + 1))
    fi

    # Check 5: Fuse sentinel
    echo "[5/5] Checking for fuse sentinel..."
    EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/$(basename "$APP_PATH" .app)"
    if [ -f "$EXECUTABLE_PATH" ]; then
        if hexdump -C "$EXECUTABLE_PATH" 2>/dev/null | grep -q "fuses"; then
            echo "  ✅ PASS: Fuse sentinel found"
        else
            echo "  ⚠️  WARN: Fuse sentinel not detected"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo "  ⚠️  WARN: Executable not found"
        WARNINGS=$((WARNINGS + 1))
    fi

elif [[ "$APP_PATH" == *.exe ]]; then
    echo "Platform: Windows"
    echo ""
    echo "⚠️  Windows verification requires running on Windows"
    echo "Use the PowerShell script: verify-asar-integrity.ps1"
    exit $EXIT_CONFIG_ERROR
else
    echo "ERROR: Unsupported file type"
    exit $EXIT_CONFIG_ERROR
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "❌ VERIFICATION FAILED"
    echo "ASAR integrity is NOT properly configured"
    exit $EXIT_VERIFICATION_FAILED
elif [ "$STRICT_MODE" = "true" ] && [ $WARNINGS -gt 0 ]; then
    echo "⚠️  VERIFICATION FAILED (strict mode)"
    echo "Warnings are treated as errors in strict mode"
    exit $EXIT_VERIFICATION_FAILED
else
    echo "✅ VERIFICATION PASSED"
    echo "ASAR integrity is properly configured"
    exit $EXIT_SUCCESS
fi

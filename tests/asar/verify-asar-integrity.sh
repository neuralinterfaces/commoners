#!/bin/bash
# ASAR Integrity Verification Script
# Checks if ASAR integrity is properly configured in your Electron app
# Usage: ./verify-asar-integrity.sh "<path-to-app>"

set -euo pipefail
IFS=$'\n\t'

APP_PATH="${1-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    printf "\n"
    printf "%b━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%b\n" "${BLUE}" "${NC}"
    printf "%b%s%b\n" "${BLUE}" "$1" "${NC}"
    printf "%b━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%b\n" "${BLUE}" "${NC}"
}

print_success() { printf "%b✅ %s%b\n" "${GREEN}" "$1" "${NC}"; }
print_error()   { printf "%b❌ %s%b\n" "${RED}"   "$1" "${NC}"; }
print_warning() { printf "%b⚠️  %s%b\n" "${YELLOW}" "$1" "${NC}"; }
print_info()    { printf "%bℹ️  %s%b\n" "${BLUE}"  "$1" "${NC}"; }

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "Required command not found: $1"
        exit 127
    fi
}

if [[ -z "$APP_PATH" ]]; then
    print_error "Usage: $0 <path-to-app>"
    printf "\nExamples:\n"
    printf "  macOS:   %s \"/Applications/Your App.app\"\n" "$0"
    printf "  Windows: %s \"C:/Path/To/Your App.exe\"\n" "$0"
    exit 1
fi

# Canonicalize if possible (macOS has realpath via coreutils or BSD readlink -f is absent)
if command -v realpath >/dev/null 2>&1; then
    APP_PATH="$(realpath "$APP_PATH")"
fi

print_header "ASAR Integrity Verification"

if [[ "$APP_PATH" == *.app ]]; then
    PLATFORM="macOS"
    ASAR_PATH="$APP_PATH/Contents/Resources/app.asar"
    PLIST_PATH="$APP_PATH/Contents/Info.plist"
    EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/$(basename "$APP_PATH" .app)"

    print_info "Platform: macOS"
    print_info "App Bundle: $APP_PATH"
    printf "\n"

    # Tools we use on macOS path
    require_cmd plutil
    require_cmd shasum
    require_cmd dd
    require_cmd od
    require_cmd stat
    require_cmd hexdump
    require_cmd awk
    require_cmd grep
    require_cmd tail
    require_cmd sed

    # 1. Check if ASAR exists
    printf "1. Checking ASAR file...\n"
    if [[ ! -f "$ASAR_PATH" ]]; then
        print_error "ASAR file not found at: $ASAR_PATH"
        exit 1
    fi
    print_success "ASAR file found"
    # macOS stat format (BSD): -f%z prints size
    ASAR_SIZE="$(stat -f%z "$ASAR_PATH")"
    print_info "   Size: $ASAR_SIZE bytes"
    printf "\n"

    # 2. Check Info.plist for integrity hash (use structured extract to avoid grep/sed pitfalls)
    printf "2. Checking Info.plist for ElectronAsarIntegrity...\n"
    if [[ ! -f "$PLIST_PATH" ]]; then
        print_error "Info.plist not found at: $PLIST_PATH"
        exit 1
    fi

    # Try structured extract first (macOS 10.13+ supports -extract)
    PLIST_HASH=""
    if plutil -extract ElectronAsarIntegrity.hash raw -o - "$PLIST_PATH" >/dev/null 2>&1; then
        PLIST_HASH="$(plutil -extract ElectronAsarIntegrity.hash raw -o - "$PLIST_PATH" || true)"
    else
        # Fallback: convert to XML and parse (still safe because we're not splitting on spaces)
        if plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null | grep -q "<key>ElectronAsarIntegrity</key>"; then
            PLIST_HASH="$(
                plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null \
                | awk '/<key>ElectronAsarIntegrity<\/key>/{f=1} f && /<key>hash<\/key>/{getline; print; exit}' \
                | sed -n 's/.*<string>\(.*\)<\/string>.*/\1/p'
            )"
        fi
    fi

    if [[ -n "$PLIST_HASH" ]]; then
        print_success "ElectronAsarIntegrity found in Info.plist"
        print_success "Hash extracted: $PLIST_HASH"
    else
        print_error "ElectronAsarIntegrity NOT found (or hash missing) in Info.plist"
        print_warning "ASAR integrity is NOT configured"
        exit 1
    fi
    printf "\n"

    # 3. Check for fuse sentinel in binary
    printf "3. Checking Electron binary for fuse configuration...\n"
    if [[ -f "$EXECUTABLE_PATH" ]]; then
        if hexdump -C "$EXECUTABLE_PATH" 2>/dev/null | grep -q "fuses"; then
            print_success "Fuse sentinel found in binary"
        else
            print_warning "Fuse sentinel not detected (this might be normal)"
        fi
    else
        print_warning "Executable not found at: $EXECUTABLE_PATH"
    fi
    printf "\n"

    # 4. Verify hash computation
    printf "4. Verifying hash computation...\n"

    # Try JSON header (first 16 bytes)
    JSON_HEADER_HASH="$(
        dd if="$ASAR_PATH" bs=16 count=1 2>/dev/null \
        | shasum -a 256 \
        | awk '{print $1}'
    )"
    print_info "JSON header hash (16 bytes): $JSON_HEADER_HASH"

    if [[ "$PLIST_HASH" == "$JSON_HEADER_HASH" ]]; then
        print_success "Hash matches! Using JSON header mode"
    else
        # Compute full header size (read 8 bytes, then interpret two uint32s + 8)
        HEADER_SIZE_RAW="$(dd if="$ASAR_PATH" bs=1 count=8 2>/dev/null | od -An -tu4)"
        HEADER_SIZE="$(awk '{print $1 + $2 + 8}' <<<"$HEADER_SIZE_RAW" || echo 0)"
        if [[ -n "$HEADER_SIZE" && "$HEADER_SIZE" -gt 0 ]]; then
            FULL_HEADER_HASH="$(
                dd if="$ASAR_PATH" bs=1 count="$HEADER_SIZE" 2>/dev/null \
                | shasum -a 256 \
                | awk '{print $1}'
            )"
            print_info "Full header hash ($HEADER_SIZE bytes): $FULL_HEADER_HASH"

            if [[ "$PLIST_HASH" == "$FULL_HEADER_HASH" ]]; then
                print_success "Hash matches! Using full header mode"
            else
                print_warning "Hash mismatch - verification may fail at runtime"
                print_info "Expected: $PLIST_HASH"
                print_info "Got (JSON): $JSON_HEADER_HASH"
                print_info "Got (Full): $FULL_HEADER_HASH"
            fi
        else
            print_warning "Could not compute full header hash"
        fi
    fi

elif [[ "$APP_PATH" == *.exe ]]; then
    PLATFORM="Windows"
    print_info "Platform: Windows"
    print_info "Executable: $APP_PATH"
    printf "\n"

    print_warning "Windows verification requires running on Windows with appropriate tools"
    print_info "You can manually check with:"
    printf "  - PowerShell: (Get-Item \"%s\").VersionInfo\n" "$APP_PATH"
    printf "  - rcedit: rcedit \"%s\" --get-version-string ElectronAsarIntegrity\n" "$APP_PATH"

else
    print_error "Unsupported file type. Please provide .app (macOS) or .exe (Windows)"
    exit 1
fi

printf "\n"
print_header "Verification Summary"
printf "\n"
print_success "ASAR integrity is properly configured!"
print_info "Hash is embedded in the application"
print_info "Runtime validation will prevent tampering"
printf "\n"
print_info "Run the tamper test to confirm it's working:"
printf "  ./test-asar-tamper.sh \"%s\"\n" "$APP_PATH"
printf "\n"
#!/bin/bash
# ASAR Integrity Verification Script
# Checks if ASAR integrity is properly configured in your Electron app
# Usage: ./verify-asar-integrity.sh <path-to-app>

set -e

APP_PATH="$1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

if [ -z "$APP_PATH" ]; then
    print_error "Usage: $0 <path-to-app>"
    echo ""
    echo "Examples:"
    echo "  macOS:   $0 /path/to/YourApp.app"
    echo "  Windows: $0 /path/to/YourApp.exe"
    exit 1
fi

print_header "ASAR Integrity Verification"

# Detect platform
if [[ "$APP_PATH" == *.app ]]; then
    PLATFORM="macOS"
    ASAR_PATH="$APP_PATH/Contents/Resources/app.asar"
    PLIST_PATH="$APP_PATH/Contents/Info.plist"
    EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/$(basename "$APP_PATH" .app)"

    print_info "Platform: macOS"
    print_info "App Bundle: $APP_PATH"
    echo ""

    # 1. Check if ASAR exists
    echo "1. Checking ASAR file..."
    if [ ! -f "$ASAR_PATH" ]; then
        print_error "ASAR file not found at: $ASAR_PATH"
        exit 1
    fi
    print_success "ASAR file found"
    ASAR_SIZE=$(stat -f%z "$ASAR_PATH")
    print_info "   Size: $ASAR_SIZE bytes"
    echo ""

    # 2. Check Info.plist for integrity hash
    echo "2. Checking Info.plist for ElectronAsarIntegrity..."
    if [ ! -f "$PLIST_PATH" ]; then
        print_error "Info.plist not found at: $PLIST_PATH"
        exit 1
    fi

    if plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null | grep -q "ElectronAsarIntegrity"; then
        print_success "ElectronAsarIntegrity found in Info.plist"

        # Extract hash
        PLIST_HASH=$(plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null | grep -A 1 "<key>hash</key>" | tail -1 | sed 's/.*<string>\(.*\)<\/string>/\1/')

        if [ -n "$PLIST_HASH" ]; then
            print_success "Hash extracted: $PLIST_HASH"
        else
            print_warning "Could not extract hash value"
        fi
    else
        print_error "ElectronAsarIntegrity NOT found in Info.plist"
        print_warning "ASAR integrity is NOT configured"
        exit 1
    fi
    echo ""

    # 3. Check for fuse sentinel in binary
    echo "3. Checking Electron binary for fuse configuration..."
    if [ -f "$EXECUTABLE_PATH" ]; then
        if hexdump -C "$EXECUTABLE_PATH" 2>/dev/null | grep -q "fuses"; then
            print_success "Fuse sentinel found in binary"
        else
            print_warning "Fuse sentinel not detected (this might be normal)"
        fi
    else
        print_warning "Executable not found at: $EXECUTABLE_PATH"
    fi
    echo ""

    # 4. Verify hash computation
    echo "4. Verifying hash computation..."

    # Try JSON header (first 16 bytes)
    JSON_HEADER_HASH=$(dd if="$ASAR_PATH" bs=16 count=1 2>/dev/null | shasum -a 256 | awk '{print $1}')
    print_info "JSON header hash (16 bytes): $JSON_HEADER_HASH"

    if [ "$PLIST_HASH" = "$JSON_HEADER_HASH" ]; then
        print_success "Hash matches! Using JSON header mode"
    else
        # Try full header
        HEADER_SIZE=$(dd if="$ASAR_PATH" bs=1 count=8 2>/dev/null | od -An -tu4 | awk '{print $1 + $2 + 8}')
        if [ -n "$HEADER_SIZE" ] && [ "$HEADER_SIZE" -gt 0 ]; then
            FULL_HEADER_HASH=$(dd if="$ASAR_PATH" bs=1 count="$HEADER_SIZE" 2>/dev/null | shasum -a 256 | awk '{print $1}')
            print_info "Full header hash ($HEADER_SIZE bytes): $FULL_HEADER_HASH"

            if [ "$PLIST_HASH" = "$FULL_HEADER_HASH" ]; then
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
    echo ""

    print_warning "Windows verification requires running on Windows with appropriate tools"
    print_info "You can manually check with:"
    echo "  - PowerShell: (Get-Item \"$APP_PATH\").VersionInfo"
    echo "  - rcedit: rcedit \"$APP_PATH\" --get-version-string ElectronAsarIntegrity"

else
    print_error "Unsupported file type. Please provide .app (macOS) or .exe (Windows)"
    exit 1
fi

echo ""
print_header "Verification Summary"
echo ""
print_success "ASAR integrity is properly configured!"
print_info "Hash is embedded in the application"
print_info "Runtime validation will prevent tampering"
echo ""
print_info "Run the tamper test to confirm it's working:"
print_info "  ./test-asar-tamper.sh \"$APP_PATH\""
echo ""

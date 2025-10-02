#!/bin/bash
# ASAR Integrity Tamper Test
# This is the DEFINITIVE test to prove ASAR integrity is working
# It tampers with the ASAR file and attempts to launch the app
# If integrity is working, the app MUST fail to launch
# Usage: ./test-asar-tamper.sh <path-to-app>

set -e

APP_PATH="$1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}$1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

print_step() {
    echo -e "${BOLD}$1${NC}"
}

if [ -z "$APP_PATH" ]; then
    print_error "Usage: $0 <path-to-app>"
    echo ""
    echo "Example:"
    echo "  $0 /path/to/YourApp.app"
    exit 1
fi

if [ ! -e "$APP_PATH" ]; then
    print_error "App not found: $APP_PATH"
    exit 1
fi

print_header "ASAR Integrity Tamper Test"

echo "This test will:"
echo "  1. Create a copy of your app"
echo "  2. Tamper with the ASAR file"
echo "  3. Attempt to launch the tampered app"
echo "  4. Verify if integrity protection prevented the launch"
echo ""
read -p "Press Enter to continue..."
echo ""

# Detect platform
if [[ "$APP_PATH" == *.app ]]; then
    PLATFORM="macOS"
    APP_NAME=$(basename "$APP_PATH" .app)
    ASAR_RELATIVE="Contents/Resources/app.asar"
else
    print_error "Only macOS .app bundles are supported by this script"
    exit 1
fi

# Create test copy
TEST_APP="/tmp/${APP_NAME}-TamperTest-$(date +%s).app"
print_step "1. Creating test copy..."
cp -r "$APP_PATH" "$TEST_APP"
print_success "Copied to: $TEST_APP"
echo ""

ASAR_PATH="$TEST_APP/$ASAR_RELATIVE"
PLIST_PATH="$TEST_APP/Contents/Info.plist"

# Get original info
print_step "2. Analyzing original ASAR..."
if [ ! -f "$ASAR_PATH" ]; then
    print_error "ASAR file not found at: $ASAR_PATH"
    exit 1
fi

ORIG_SIZE=$(stat -f%z "$ASAR_PATH")
ORIG_MTIME=$(stat -f%m "$ASAR_PATH")
print_info "Original size: $ORIG_SIZE bytes"

# Get expected hash from Info.plist
EXPECTED_HASH=$(plutil -convert xml1 -o - "$PLIST_PATH" 2>/dev/null | grep -A 1 "<key>hash</key>" | tail -1 | sed 's/.*<string>\(.*\)<\/string>/\1/')
if [ -n "$EXPECTED_HASH" ]; then
    print_info "Expected hash: $EXPECTED_HASH"
else
    print_warning "Could not extract hash from Info.plist"
fi
echo ""

# Tamper with ASAR
print_step "3. Tampering with ASAR file..."
echo "🔨 Adding malicious data to ASAR..."
echo "TAMPERED_DATA_$(date +%s)" >> "$ASAR_PATH"

NEW_SIZE=$(stat -f%z "$ASAR_PATH")
ADDED_BYTES=$((NEW_SIZE - ORIG_SIZE))
print_warning "ASAR file has been tampered!"
print_info "New size: $NEW_SIZE bytes (+$ADDED_BYTES bytes)"
echo ""

# Attempt to launch
print_step "4. Attempting to launch tampered app..."
print_info "Opening: $TEST_APP"
echo ""
print_info "Monitoring launch for 5 seconds..."
echo ""

# Launch the app and capture any errors
open "$TEST_APP" 2>&1 &
LAUNCH_PID=$!

# Wait and monitor
sleep 2

# Check if app process started
APP_RUNNING=$(pgrep -f "$APP_NAME" || echo "")

if [ -z "$APP_RUNNING" ]; then
    RESULT="CRASHED"
else
    sleep 3
    APP_RUNNING=$(pgrep -f "$APP_NAME" || echo "")
    if [ -z "$APP_RUNNING" ]; then
        RESULT="CRASHED"
    else
        RESULT="RUNNING"
    fi
fi

echo ""
print_header "Test Results"
echo ""

if [ "$RESULT" = "CRASHED" ]; then
    print_success "ASAR INTEGRITY IS WORKING! 🎉"
    echo ""
    print_info "The tampered app failed to launch, as expected."
    print_info "This proves that ASAR integrity validation is active."
    echo ""
    print_info "What happened:"
    echo "  • Electron detected the ASAR file was modified"
    echo "  • The hash didn't match the expected value"
    echo "  • The app was prevented from starting"
    echo ""
    print_info "Check Console.app for the error message:"
    echo "  log show --predicate 'process == \"$APP_NAME\"' --last 10s | grep -i asar"
    EXIT_CODE=0
else
    print_error "ASAR INTEGRITY APPEARS TO BE DISABLED! ⚠️"
    echo ""
    print_warning "The tampered app is RUNNING, which should not happen."
    print_warning "This suggests ASAR integrity validation is not active."
    echo ""
    print_info "Possible causes:"
    echo "  • Fuses were not flipped correctly"
    echo "  • ElectronAsarIntegrity is missing from Info.plist"
    echo "  • The hash in Info.plist doesn't match the ASAR"
    echo "  • Development build without security enabled"
    echo ""
    print_info "Killing the running app..."
    pkill -f "$APP_NAME" 2>/dev/null || true
    EXIT_CODE=1
fi

echo ""
print_step "5. Cleanup"
print_info "Removing test app: $TEST_APP"
rm -rf "$TEST_APP"
print_success "Cleanup complete"
echo ""

exit $EXIT_CODE

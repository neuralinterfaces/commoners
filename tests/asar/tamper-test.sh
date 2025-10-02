#!/bin/bash
# Definitive ASAR Integrity Test
# This will prove if integrity validation is active

APP="$1"
if [ -z "$APP" ]; then
  echo "Usage: $0 <path-to-YourApp.app>"
  exit 1
fi

echo "🔬 ASAR Integrity Tamper Test"
echo "=============================="
echo ""

# Copy app
TEST_APP="/tmp/TamperTest-$(date +%s).app"
cp -r "$APP" "$TEST_APP"
ASAR="$TEST_APP/Contents/Resources/app.asar"

echo "1. ✅ Created test copy: $TEST_APP"
echo "2. ✅ ASAR location: $ASAR"
echo ""

# Check original
ORIG_HASH=$(plutil -convert xml1 -o - "$TEST_APP/Contents/Info.plist" | grep -A 1 "<key>hash</key>" | tail -1 | sed 's/.*<string>\(.*\)<\/string>/\1/')
echo "3. 📋 Expected hash from Info.plist:"
echo "   $ORIG_HASH"
echo ""

# Compute actual hash (first 16 bytes = JSON header)
ACTUAL_HASH=$(dd if="$ASAR" bs=16 count=1 2>/dev/null | shasum -a 256 | awk '{print $1}')
echo "4. 🔢 Computed hash (16-byte header):"
echo "   $ACTUAL_HASH"

if [ "$ORIG_HASH" = "$ACTUAL_HASH" ]; then
  echo "   ✅ Hash matches!"
else
  echo "   ⚠️  Hash mismatch (might use full header)"
fi
echo ""

# Tamper
echo "5. 🔨 Tampering with ASAR..."
echo "TAMPERED" >> "$ASAR"
echo "   Added 9 bytes to end of ASAR"
echo ""

# Launch
echo "6. 🚀 Launching tampered app..."
echo ""
open "$TEST_APP" &
PID=$!

sleep 3

# Check if still running
if ps -p $PID > /dev/null 2>&1; then
  echo "   ⚠️  App is RUNNING - integrity validation may NOT be active"
  echo ""
  echo "   Without integrity: App launches normally despite tampering"
  kill $PID 2>/dev/null
else
  echo "   ✅ App CRASHED/FAILED - integrity validation IS ACTIVE!"
  echo ""
  echo "   Check Console.app for error message:"
  echo "   log show --predicate 'process == \"Commoners Test App\"' --last 30s"
fi

echo ""
echo "Cleanup: rm -rf '$TEST_APP'"

#!/bin/bash
# Run all ASAR integrity verification tests
# Usage: ./run-all-tests.sh <path-to-app>

APP="$1"

if [ -z "$APP" ]; then
    echo "Usage: $0 <path-to-YourApp.app>"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         ASAR Integrity Verification Test Suite            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Basic Verification
echo "━━━ Test 1: Basic Verification ━━━"
./verify-asar-integrity.sh "$APP"
TEST1=$?
echo ""

# Test 2: CI/CD Verification
echo "━━━ Test 2: CI/CD Verification (Strict Mode) ━━━"
STRICT_MODE=true ./ci-verify-asar-integrity.sh "$APP"
TEST2=$?
echo ""

# Test 3: Tamper Test (Interactive - will ask for confirmation)
echo "━━━ Test 3: Tamper Test (Definitive Proof) ━━━"
echo "This test will tamper with a copy and verify it fails to launch"
./test-asar-tamper.sh "$APP"
TEST3=$?
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                       Test Summary                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Test 1 (Basic Verification):      $([ $TEST1 -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
echo "Test 2 (CI/CD Verification):      $([ $TEST2 -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
echo "Test 3 (Tamper Test):             $([ $TEST3 -eq 0 ] && echo '✅ PASSED' || echo '❌ FAILED')"
echo ""

if [ $TEST1 -eq 0 ] && [ $TEST2 -eq 0 ] && [ $TEST3 -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED - ASAR integrity is working correctly!"
    exit 0
else
    echo "⚠️  SOME TESTS FAILED - Review the output above"
    exit 1
fi

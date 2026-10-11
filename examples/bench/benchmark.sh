#!/usr/bin/env bash
# Benchmark: measures commoners overhead vs raw Vite and desktop runtimes
# Usage: bash examples/bench/benchmark.sh [--desktop]
# Pass --desktop to include Electron and Tauri builds (slow, requires toolchains)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VITE="$REPO_ROOT/node_modules/.bin/vite"
COMMONERS="$REPO_ROOT/node_modules/.bin/commoners"
BASELINE_DIR=$(mktemp -d)
INCLUDE_DESKTOP=false

for arg in "$@"; do
  case "$arg" in
    --desktop) INCLUDE_DESKTOP=true ;;
  esac
done

cleanup() { rm -rf "$BASELINE_DIR" "$SCRIPT_DIR/.commoners"; }
trap cleanup EXIT

echo "============================================"
echo "  Commoners Overhead Benchmark"
echo "============================================"
echo ""

# ── 1. Dependency weight ──────────────────────
echo "── 1. Dependency Weight ──"
echo ""
CORE_DEPS=$(node -e "const p=require('$REPO_ROOT/packages/core/package.json'); console.log(Object.keys(p.dependencies||{}).length)")
CORE_PEER=$(node -e "const p=require('$REPO_ROOT/packages/core/package.json'); console.log(Object.keys(p.peerDependencies||{}).length)")
echo "  @commoners/solidarity direct deps: $CORE_DEPS"
echo "  @commoners/solidarity peer deps:   $CORE_PEER"
echo "  Core dist/ size:  $(du -sh "$REPO_ROOT/packages/core/dist/" | awk '{print $1}')"
TOTAL_NM=$(du -sh "$REPO_ROOT/node_modules/" | awk '{print $1}')
echo "  Total node_modules (monorepo):     $TOTAL_NM"
echo ""

# ── 2. Raw Vite baseline ─────────────────────
echo "── 2. Raw Vite Baseline Build ──"
echo ""
cp "$SCRIPT_DIR/index.html" "$BASELINE_DIR/index.html"
VITE_START=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
(cd "$BASELINE_DIR" && $VITE build --outDir dist 2>&1) | grep -E '✓|index\.html'
VITE_END=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
VITE_TIME=$(perl -e "printf '%.0f', ($VITE_END - $VITE_START) * 1000")
VITE_SIZE=$(du -sh "$BASELINE_DIR/dist/" | awk '{print $1}')
VITE_FILES=$(find "$BASELINE_DIR/dist" -type f | wc -l | tr -d ' ')
echo "  Time:  ${VITE_TIME}ms"
echo "  Size:  $VITE_SIZE ($VITE_FILES files)"
echo ""

# ── 3. Commoners web build ───────────────────
echo "── 3. Commoners Web Build ──"
echo ""
rm -rf "$SCRIPT_DIR/.commoners"
COMM_START=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
$COMMONERS build "$SCRIPT_DIR" --target web 2>&1 | grep -E '✓|built in|index\.html|\.mjs|\.cjs|\.js|\.css|\.png' || true
COMM_END=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
COMM_TIME=$(perl -e "printf '%.0f', ($COMM_END - $COMM_START) * 1000")
COMM_OUT="$SCRIPT_DIR/.commoners/web"
if [ -d "$COMM_OUT" ]; then
  COMM_SIZE=$(du -sh "$COMM_OUT" | awk '{print $1}')
  COMM_FILES=$(find "$COMM_OUT" -type f | wc -l | tr -d ' ')
  COMM_OVERHEAD=$(du -sk "$COMM_OUT" | awk '{print $1}')
  VITE_KB=$(du -sk "$BASELINE_DIR/dist/" | awk '{print $1}')
  OVERHEAD_KB=$((COMM_OVERHEAD - VITE_KB))
  echo "  Time:  ${COMM_TIME}ms"
  echo "  Size:  $COMM_SIZE ($COMM_FILES files)"
  echo "  Commoners overhead: ${OVERHEAD_KB} KB"
  echo ""

  # ── 4. File breakdown ─────────────────────
  echo "── 4. Commoners Web Output Breakdown ──"
  echo ""
  find "$COMM_OUT" -type f -exec ls -lh {} \; | awk '{printf "  %-8s %s\n", $5, $NF}' | sort -k2
  echo ""
else
  echo "  Build failed — no output directory"
  COMM_SIZE="N/A"
  COMM_FILES=0
  OVERHEAD_KB="N/A"
  echo ""
fi

# ── 5. Web summary ───────────────────────────
echo "── 5. Web Summary ──"
echo ""
echo "  │ Metric         │ Raw Vite       │ Commoners      │"
echo "  ├────────────────┼────────────────┼────────────────┤"
printf "  │ Build time     │ %13sms │ %13sms │\n" "$VITE_TIME" "$COMM_TIME"
printf "  │ Output size    │ %14s │ %14s │\n" "$VITE_SIZE" "$COMM_SIZE"
printf "  │ Output files   │ %14s │ %14s │\n" "$VITE_FILES" "$COMM_FILES"
printf "  │ Overhead       │              - │ %11s KB │\n" "$OVERHEAD_KB"
echo ""

rm -rf "$SCRIPT_DIR/.commoners"

# ── 6. Desktop builds (optional) ─────────────
if [ "$INCLUDE_DESKTOP" = false ]; then
  echo "Skipping desktop builds. Pass --desktop to include Electron and Tauri."
  echo ""
  exit 0
fi

echo "── 6. Electron Desktop Build ──"
echo ""
ELECTRON_START=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
$COMMONERS build "$SCRIPT_DIR" --target electron 2>&1 | tail -1 || true
ELECTRON_END=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
ELECTRON_TIME=$(perl -e "printf '%.0f', ($ELECTRON_END - $ELECTRON_START) * 1000")

ELECTRON_APP=$(find "$SCRIPT_DIR/.commoners/electron" -name "*.app" -maxdepth 2 2>/dev/null | head -1)
if [ -n "$ELECTRON_APP" ]; then
  ELECTRON_SIZE=$(du -sh "$ELECTRON_APP" | awk '{print $1}')
  # Measure Commoners-specific content (ASAR)
  ELECTRON_ASAR=$(find "$ELECTRON_APP" -name "app.asar" 2>/dev/null | head -1)
  if [ -n "$ELECTRON_ASAR" ]; then
    ELECTRON_ASAR_SIZE=$(du -sk "$ELECTRON_ASAR" | awk '{print $1}')
  else
    ELECTRON_ASAR_SIZE="N/A"
  fi
  # Measure Electron framework (everything except Resources)
  ELECTRON_FRAMEWORK=$(du -sk "$ELECTRON_APP/Contents/Frameworks/" 2>/dev/null | awk '{print $1}')
  echo "  Time:            ${ELECTRON_TIME}ms"
  echo "  Total .app size: $ELECTRON_SIZE"
  echo "  Frameworks:      $((ELECTRON_FRAMEWORK / 1024)) MB (Electron + Chromium)"
  echo "  app.asar:        ${ELECTRON_ASAR_SIZE} KB (Commoners overhead)"
  echo ""
  echo "  ASAR contents:"
  if [ -n "$ELECTRON_ASAR" ]; then
    npx asar list "$ELECTRON_ASAR" 2>/dev/null | while read f; do echo "    $f"; done
  fi
else
  echo "  Electron build failed — no .app found"
fi
echo ""
rm -rf "$SCRIPT_DIR/.commoners"

echo "── 7. Tauri Desktop Build ──"
echo ""
TAURI_START=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
$COMMONERS build "$SCRIPT_DIR" --target tauri 2>&1 | tail -1 || true
TAURI_END=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
TAURI_TIME=$(perl -e "printf '%.0f', ($TAURI_END - $TAURI_START) * 1000")

TAURI_APP=$(find "$SCRIPT_DIR/.commoners/tauri" -name "*.app" -maxdepth 2 2>/dev/null | head -1)
if [ -n "$TAURI_APP" ]; then
  TAURI_SIZE=$(du -sh "$TAURI_APP" | awk '{print $1}')
  TAURI_BINARY=$(find "$TAURI_APP/Contents/MacOS" -type f 2>/dev/null | head -1)
  if [ -n "$TAURI_BINARY" ]; then
    TAURI_BIN_SIZE=$(du -sh "$TAURI_BINARY" | awk '{print $1}')
  else
    TAURI_BIN_SIZE="N/A"
  fi
  echo "  Time:            ${TAURI_TIME}ms"
  echo "  Total .app size: $TAURI_SIZE"
  echo "  Binary:          $TAURI_BIN_SIZE (Tauri runtime + embedded web assets)"
  echo ""
else
  echo "  Tauri build failed — no .app found"
fi
echo ""
rm -rf "$SCRIPT_DIR/.commoners"

# ── 8. Desktop summary ───────────────────────
echo "── 8. Desktop Summary ──"
echo ""
echo "  │ Metric               │ Electron           │ Tauri              │"
echo "  ├──────────────────────┼────────────────────┼────────────────────┤"
printf "  │ Build time           │ %17sms │ %17sms │\n" "$ELECTRON_TIME" "$TAURI_TIME"
printf "  │ Total app size       │ %18s │ %18s │\n" "${ELECTRON_SIZE:-N/A}" "${TAURI_SIZE:-N/A}"
printf "  │ Commoners overhead   │ %15s KB │ %15s KB │\n" "${ELECTRON_ASAR_SIZE:-N/A}" "${OVERHEAD_KB:-N/A}"
echo ""

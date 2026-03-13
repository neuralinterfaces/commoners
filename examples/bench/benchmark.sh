#!/usr/bin/env bash
# Benchmark: measures commoners overhead vs raw Vite on a blank app
# Usage: bash examples/bench/benchmark.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VITE="$REPO_ROOT/node_modules/.bin/vite"
COMMONERS="$REPO_ROOT/node_modules/.bin/commoners"
BASELINE_DIR=$(mktemp -d)

cleanup() { rm -rf "$BASELINE_DIR"; }
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
  echo "  Time:  ${COMM_TIME}ms"
  echo "  Size:  $COMM_SIZE ($COMM_FILES files)"
  echo ""

  # ── 4. File breakdown ─────────────────────
  echo "── 4. Commoners Output Breakdown ──"
  echo ""
  find "$COMM_OUT" -type f -exec ls -lh {} \; | awk '{printf "  %-8s %s\n", $5, $NF}' | sort -k2
  echo ""
else
  echo "  Build failed — no output directory"
  COMM_SIZE="N/A"
  COMM_FILES=0
  echo ""
fi

# ── 5. Summary ───────────────────────────────
echo "── 5. Summary ──"
echo ""
echo "  │ Metric         │ Raw Vite       │ Commoners      │"
echo "  ├────────────────┼────────────────┼────────────────┤"
printf "  │ Build time     │ %13sms │ %13sms │\n" "$VITE_TIME" "$COMM_TIME"
printf "  │ Output size    │ %14s │ %14s │\n" "$VITE_SIZE" "$COMM_SIZE"
printf "  │ Output files   │ %14s │ %14s │\n" "$VITE_FILES" "$COMM_FILES"
echo ""

# Cleanup commoners output
rm -rf "$SCRIPT_DIR/.commoners"

# Tests

## Running Tests

- `pnpm test` from repo root — runs all tests
- Individual suites: `pnpm test:start`, `pnpm test:desktop`, etc.

## Critical Constraints

- **No parallel execution**: `fileParallelism: false` — tests share `.commoners/.tmp` via single-instance lock
- **No concurrent suites**: Port conflicts (especially port 2345 for http service)
- **Desktop test order**: `desktop-build.test.ts` → `desktop.test.ts` → `desktop-zlaunch.test.ts`
- **`index.test.ts`**: Excluded — it's a redundant aggregator

## Environment Requirements

| Test Suite | Requirement |
|------------|-------------|
| C++ services | `g++` installed |
| Python services | `conda activate commoners-demo` (PyInstaller on PATH) |
| Desktop | macOS/Linux/Windows with Electron support |
| Linux desktop | FUSE (`sudo apt-get install -y fuse`) |

## Known Flakiness

- Desktop start tests: stable in isolation, flaky in full suite (page closes mid-test)
- Echo test: 90s timeout to handle full-suite resource contention
- **NEVER** use `lsof -ti :PORT | xargs kill -9` in test cleanup — kills the vitest worker

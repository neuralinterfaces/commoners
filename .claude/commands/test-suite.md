Run the specified test suite (or all tests if none specified). Ensure proper environment and sequencing.

Available suites: start, config, security, desktop, services, wasm, build, env, protocol, mobile-workflow

Important constraints:
- Do NOT run test suites concurrently (port conflicts, especially port 2345)
- Desktop test order: desktop-build → desktop → desktop-zlaunch
- Python service tests require `conda activate commoners-demo`
- Echo test may need 90s timeout under resource contention

Run: `pnpm test:$ARGUMENTS` (or `pnpm test` if no suite specified)

After the run, summarize: pass/fail counts, any flaky failures, and whether re-running in isolation would help.

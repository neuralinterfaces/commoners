# Testing Gaps and Distribution Pipeline

Implementation plan for closing E2E test gaps (protocol, WASM, mobile) and building automated mobile distribution.

---

## Problem

Several test areas were deferred during recent work and need to be tracked and implemented:

1. **Protocol E2E tests** — Unit tests exist for protocol utilities, but no test builds + launches an Electron app to verify `commoners://` protocol handling end-to-end.
2. **WASM compilation E2E** — Unit tests mock WASM service construction, but no test actually invokes `wasm-pack` to compile Rust to WASM.
3. **Mobile build output tests** — `tests/mobile-workflow.test.ts` has 5 deferred test areas covering native config injection, web asset sync, and extension capabilities.
4. **Native emulator testing** — No tests run on actual Android/iOS emulators.
5. **Automated mobile distribution** — No CI/CD pipeline for publishing to app stores.

---

## Current State

### Existing Test Coverage

| Suite | Tests | Status | Script |
|-------|-------|--------|--------|
| Protocol (unit) | 18 | Pass | `pnpm test:protocol` |
| WASM (unit) | 18 | Pass | `pnpm test:wasm` |
| Mobile workflow | 6 | Pass | `pnpm test:mobile-workflow` |
| Desktop (start) | 18 | Pass (flaky in full suite) | `pnpm test:desktop` |
| Desktop (build+launch) | 10 | Pass | `pnpm test:desktop-zlaunch` |
| Start (web + mobile) | 32 | Pass | `pnpm test:start` |
| API | 48 | Pass | `pnpm test:config` |
| Services | Varies | Python skips without conda | `pnpm test:services` |

### Deferred Items (from ROADMAP.md)

- Full E2E protocol tests (deferred from Custom Protocol work)
- E2E WASM compilation test (deferred from WASM Service Compilation work)
- Mobile testing TODO gaps (from `tests/mobile-workflow.test.ts` lines 94-133)

---

## Implementation Plan

### 1. Protocol E2E Tests

**Goal:** Verify `commoners://services/*`, `commoners://pages/*`, and `commoners://plugins/*` routes work in a running Electron app.

**Approach:**
1. Add tests to `tests/desktop.test.ts` or a new `tests/protocol-e2e.test.ts`
2. Build + launch a demo Electron app (reuse `desktop-zlaunch` infrastructure)
3. Navigate to `commoners://pages/index.html` and verify page loads
4. Fetch `commoners://services/<name>` and verify proxy to service URL
5. Verify protocol handler returns proper `Response` objects with correct MIME types

**Prerequisites:** Desktop build+launch infrastructure (already stable)

**Files:**
- `tests/protocol-e2e.test.ts` (new)
- `packages/core/assets/electron/modules/protocol.ts` (reference)

### 2. WASM Compilation E2E Test

**Goal:** Verify that a Rust service compiles to WASM via `wasm-pack` and the output is usable.

**Approach:**
1. Gate behind `RUST_TOOLCHAIN` environment variable (skip when toolchain unavailable)
2. Use the demo Rust WASM service at `examples/demo/src/services/rust-wasm/`
3. Invoke `WasmCargoService.build()` and verify:
   - `wasm-pack build` completes successfully
   - Output `.wasm` and `.js` files exist at expected paths
   - Generated JS bindings are importable
4. Add to `tests/wasm.test.ts` as a conditional test block

**Prerequisites:** Rust toolchain + `wasm-pack` installed; `wasm32-unknown-unknown` target added

**Files:**
- `tests/wasm.test.ts` (extend)
- `packages/core/services/wasm.ts` (reference)

### 3. Mobile Build Output Tests

**Goal:** Close the 5 deferred test areas from `tests/mobile-workflow.test.ts`.

**Test areas (from lines 94-133):**

| Area | What to verify |
|------|---------------|
| Platform directory structure | iOS/Android directories from `cap add` contain expected native files |
| Native config injection | BLE/Serial plugins inject permissions into `Info.plist` and `AndroidManifest.xml` |
| Web asset sync | `cap sync` copies built assets with `commoners` global and all pages |
| Capacitor config correctness | Generated `capacitor.config.json` matches commoners config |
| Extension capabilities | `commoners.EXTENSIONS`, `CAPABILITIES`, `query()` work in built output |

**Approach:**
1. Create `tests/mobile-build.test.ts` (split from workflow tests as suggested in TODO)
2. Require `@capacitor/cli` and `@capacitor/core` as prerequisites (skip otherwise)
3. Use a temp directory for each test to avoid state leaks
4. Verify file contents rather than running native builds (no emulator needed)

**Files:**
- `tests/mobile-build.test.ts` (new)
- `tests/mobile-workflow.test.ts` (reference; remove TODO block after implementation)

### 4. Native Emulator Testing

**Goal:** Run E2E tests on actual Android/iOS emulators in CI.

**Android:**
- Use [`ReactiveCircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner) GitHub Action
- API level 30+ with Google APIs system image
- Use Appium + WebDriverIO for WebView testing
- Alternatively: [`@onslip/automation`](https://github.com/niclas-niclas/niclas-niclas) for direct WebView automation

**iOS:**
- Use `macos-latest` runner with iOS Simulator
- Boot simulator via `xcrun simctl boot`
- Use Appium with XCUITest driver or direct `xcrun simctl` commands
- WebView testing via Safari remote debugging

**CI configuration:**
- Trigger: `workflow_dispatch` only (cost: ~$0.08/min macOS, 5-15 min/run)
- Create `.github/workflows/mobile-emulator.yml`
- Matrix: Android API 30 + iOS 17 Simulator

**Test file:** `tests/mobile-native.test.ts` (new)

**What to test:**
- App launches and displays expected content
- Native Capacitor plugins load (BLE permission prompt appears)
- `commoners` global is accessible from WebView
- Service communication works from within native container
- Page navigation functions correctly

### 5. Automated Mobile Distribution

**Goal:** CI/CD pipeline for publishing to iOS App Store and Google Play.

**Android (Google Play):**
- Build signed AAB with `cap build android --androidreleasetype=AAB`
- Use [`r0adkll/upload-google-play`](https://github.com/r0adkll/upload-google-play) GitHub Action
- Requires: keystore file (GitHub secret), Google Play service account JSON
- Publish to internal track first, promote manually

**iOS (App Store Connect):**
- Build IPA with `xcodebuild archive` + `xcodebuild -exportArchive`
- Use [`apple-actions/upload-testflight-build`](https://github.com/Apple-Actions/upload-testflight-build) or Fastlane
- Requires: Apple Developer certificate, provisioning profile, App Store Connect API key
- Reference: [dulvui/godot-ios-upload](https://github.com/dulvui/godot-ios-upload) for workflow patterns

**CI configuration:** `.github/workflows/mobile-release.yml`
- Trigger: `workflow_dispatch` with version input
- Separate jobs for Android and iOS
- Signing credentials stored as encrypted GitHub secrets

---

## Dependencies

| Item | Depends On |
|------|-----------|
| Protocol E2E | Desktop build+launch infrastructure (done) |
| WASM E2E | Rust toolchain + wasm-pack (CI env variable gate) |
| Mobile build output | @capacitor/cli, @capacitor/core installed |
| Native emulator | CI macOS runner, Android SDK, emulator images |
| Mobile distribution | Apple Developer account, Google Play Console access |

---

## Verification

- [ ] Protocol E2E: `commoners://` URLs resolve correctly in built Electron app
- [ ] WASM E2E: `wasm-pack build` produces valid `.wasm` + JS bindings
- [ ] Mobile build: all 5 deferred test areas have passing tests
- [ ] Native emulator: app launches and `commoners` global is accessible
- [ ] Distribution: AAB uploads to Google Play internal track; IPA uploads to TestFlight

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Protocol E2E tests are slow (build+launch) | Run in `desktop-zlaunch` suite; share built app |
| WASM test requires Rust toolchain | Gate behind `RUST_TOOLCHAIN` env; skip in fast CI |
| Emulator tests are expensive | `workflow_dispatch` only; cache emulator images |
| App Store review rejects automated builds | Start with TestFlight/internal track; manual promotion |
| Mobile build tests need Capacitor deps | Skip gracefully when not installed; document setup |

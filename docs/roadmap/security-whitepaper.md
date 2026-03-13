# Security Whitepaper

Threat model, risk assessment, and implementation plan for security controls across the Commoners framework. Covers threats unique to Commoners' multi-runtime, multi-language service architecture as well as standard application security concerns.

---

## 1. Threat Model Overview

Commoners occupies a unique position in the security landscape: it orchestrates **untrusted backend services** (compiled from multiple languages) across **multiple runtime environments** (Electron, Tauri, Web, Capacitor) with **inter-process communication** bridging them all. This creates attack surfaces that no single framework addresses.

### Attack Surface Categories

| Category | Commoners-Specific? | Severity |
|----------|---------------------|----------|
| Service supply chain (multi-language deps) | **Yes** — Python, Rust, C++, Node.js each have separate package ecosystems | Critical |
| Service binary tampering | **Yes** — compiled services bundled as sidecars/extraResources | Critical |
| IPC message injection | Partially — shared with Electron/Tauri but amplified by service bridge | High |
| Protocol handler abuse | **Yes** — `commoners://` custom protocol routes to services | High |
| ASAR integrity bypass | Electron-specific but Commoners has custom implementation | High |
| Service port hijacking | **Yes** — services bind to localhost ports; local attacker can race | Medium |
| Extension/plugin code injection | Partially — plugin system loads code dynamically | Medium |
| WASM module tampering | **Yes** — WASM services loaded at runtime from filesystem | Medium |
| Config injection | **Yes** — `commoners.config.ts` is executed, not just parsed | Medium |
| Preload data poisoning | Electron-specific; `sendSync` during preload | Low-Medium |
| Device API abuse (BLE/Serial) | Shared with Web; amplified by cross-runtime abstraction | Low-Medium |
| Build-time code execution | Common to all build tools; amplified by multi-language compilation | Low |

---

## 2. Commoners-Unique Threats

### 2.1 Multi-Language Service Supply Chain

**Threat:** A compromised dependency in any language ecosystem (npm, PyPI, crates.io, vcpkg/Conan) can execute arbitrary code during build or at runtime. Commoners uniquely combines 4+ ecosystems.

**Current state:** No supply chain controls exist. Services are compiled using whatever dependencies the developer specifies.

**Proposed controls:**
- **Dependency lockfile enforcement:** Require lockfiles (`package-lock.json`, `Cargo.lock`, `requirements.txt` with hashes) for all service languages
- **Build isolation:** Compile services in sandboxed environments (Docker containers, `nsjail`, or similar)
- **SBOM generation:** Produce Software Bill of Materials for each built application listing all transitive dependencies across all languages
- **Audit tooling integration:** Run `npm audit`, `cargo audit`, `pip-audit`, `safety` as part of `commoners build`

**Plugin opportunity:** `@commoners/security-audit` plugin that hooks into build lifecycle and runs per-language audit tools.

### 2.2 Service Binary Tampering

**Threat:** Compiled service binaries (PyInstaller executables, Rust binaries, C++ executables, Node.js SEAs) are bundled alongside the application. An attacker with filesystem access can replace them.

**Current state:** ASAR integrity validates `app.asar` but NOT sidecar/extraResources binaries. Service binaries are unsigned and unverified at launch.

**Proposed controls:**
- **Binary hash verification:** At build time, compute SHA256 of each service binary. At runtime, verify before spawning.
- **Code signing for service binaries:** Sign each binary individually (macOS `codesign`, Windows `signtool`). Verify signature before spawning.
- **Tamper detection plugin:** `@commoners/integrity` plugin that verifies all bundled binaries on startup and refuses to launch tampered services.

**Implementation sketch:**
```typescript
// Build time: embed hashes in app metadata
const serviceHashes = services.map(s => ({
  name: s.name,
  hash: sha256(fs.readFileSync(s.binaryPath))
}))

// Runtime: verify before spawn
function spawnService(service) {
  const actual = sha256(fs.readFileSync(service.binaryPath))
  if (actual !== expected[service.name]) {
    throw new SecurityError(`Service binary tampered: ${service.name}`)
  }
  return spawn(service.binaryPath, service.args)
}
```

### 2.3 Custom Protocol Abuse (`commoners://`)

**Threat:** The `commoners://` protocol routes requests to internal services. If an external page (navigated via `shell.openExternal` or user action) can trigger `commoners://` requests, it could access local services.

**Current state:** Protocol handler validates service existence but does not restrict origin. No CORS enforcement on protocol responses.

**Proposed controls:**
- **Origin validation:** Only serve `commoners://` responses to pages loaded from the app itself
- **CSP enforcement:** Set strict CSP on protocol responses preventing external resource loading
- **Rate limiting:** Prevent protocol handler flooding (DoS via repeated `commoners://` requests)
- **Service access control:** Allow config to specify which services are protocol-accessible

### 2.4 Service Port Hijacking

**Threat:** Services bind to `localhost:<port>`. A local attacker (another user process) can bind to the same port before the service starts, intercepting all traffic. Or, after the service starts, a local process can connect to it.

**Current state:** No port ownership verification. Services use sequential or configured ports.

**Proposed controls:**
- **Random port assignment:** Use OS-assigned random ports (port 0) instead of fixed ports
- **Port verification:** After spawning a service, verify the process that owns the port matches the spawned PID
- **Authentication tokens:** Generate a per-session token; services must validate token on each request
- **Unix domain sockets:** On macOS/Linux, use Unix domain sockets instead of TCP (filesystem permissions control access)

**Plugin opportunity:** `@commoners/secure-services` plugin that enables token-based service authentication.

### 2.5 WASM Module Tampering

**Threat:** WASM services are loaded from the filesystem at runtime via `loadWasmService()`. An attacker could replace `.wasm` files.

**Current state:** No integrity verification for WASM modules.

**Proposed controls:**
- **Subresource Integrity (SRI) for WASM:** Compute hashes at build time, verify at load time
- **Bundle WASM in ASAR:** Include WASM files inside `app.asar` so they're covered by ASAR integrity
- **Content-addressable loading:** Reference WASM modules by hash rather than path

### 2.6 Config Execution Risk

**Threat:** `commoners.config.ts` is a TypeScript file that is executed (imported) during build and dev. A malicious config file could execute arbitrary code.

**Current state:** This is by design (configs need to be dynamic). No sandboxing.

**Proposed controls:**
- **Document the risk clearly:** Config files have full Node.js access by design — this is a feature, not a bug, but users should understand it
- **Config validation mode:** `commoners validate-config` command that parses and type-checks the config WITHOUT executing it (static analysis)
- **Template-based configs:** Offer a JSON/YAML config alternative for users who don't need dynamic configs

---

## 3. Standard Security Concerns

### 3.1 Electron Security Hardening

**Current state:** `security.ts` (~105 lines) sets context isolation, sandbox, and CSP. Not all windows may inherit these settings.

**Proposed controls:**
- Verify every `BrowserWindow` creation enforces: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- Audit `webPreferences` across all window creation paths (main window, plugin windows, splash screen)
- Implement `webContents.on('will-navigate')` restrictions globally (not just per-window)
- Block `javascript:` URLs in protocol handler

### 3.2 IPC Message Validation

**Current state:** IPC channels accept arbitrary data. No schema validation on messages.

**Proposed controls:**
- **Message schema validation:** Define expected shapes for each IPC channel; reject malformed messages
- **Channel allowlisting:** Only process messages on known channels; ignore unknown
- **Plugin IPC isolation:** Plugins should only send/receive on their own scoped channels (`plugin:<name>:*`)

### 3.3 Content Security Policy (CSP)

**Current state:** CSP is configured but may not cover all content sources (inline scripts from `transformIndexHtml`, WASM loading, service URLs).

**Proposed controls:**
- Audit CSP against actual content sources
- Add `wasm-unsafe-eval` directive for WASM services
- Use nonces for injected inline scripts rather than `unsafe-inline`
- Enforce `connect-src` whitelist for service URLs

### 3.4 Dependency Minimization

**Current state:** `packages/core/package.json` has many dependencies including optional ones (`bonjour-service`, device plugins).

**Proposed controls:**
- Audit all dependencies for necessity
- Move optional/large dependencies to dynamic imports (already done for some)
- Document security implications of each optional dependency

---

## 4. Security Testing Plan

### Automated Tests

| Test Category | What to Test | Where |
|--------------|-------------|-------|
| ASAR integrity | Hash verification passes/fails correctly | `tests/security/asar.test.ts` |
| Protocol handler | Origin validation, malformed URL handling | `tests/security/protocol.test.ts` |
| IPC validation | Malformed messages rejected, unknown channels ignored | `tests/security/ipc.test.ts` |
| CSP enforcement | Inline scripts blocked without nonce, external resources blocked | `tests/security/csp.test.ts` |
| Service binary integrity | Tampered binary detected, valid binary passes | `tests/security/services.test.ts` |
| Config validation | Malicious config patterns caught by static analysis | `tests/security/config.test.ts` |

### Manual/Periodic Audits

- **Dependency audit:** Run `npm audit`, `cargo audit` on each release
- **Penetration testing:** Focus on IPC injection, protocol handler, and service port hijacking
- **Runtime permission audit:** Verify Electron fuses, CSP, and sandbox are correctly applied in production builds

### CI Integration

- Add `pnpm test:security` script
- Run security tests on every PR
- Run dependency audits weekly via scheduled workflow
- Fail builds on known critical vulnerabilities

---

## 5. Proposed Security Plugins

### `@commoners/integrity`

**Purpose:** Runtime integrity verification for all bundled assets.

**Features:**
- Verify ASAR integrity (extend existing `packages/core/utils/asar/`)
- Verify service binary hashes on startup
- Verify WASM module integrity on load
- Report tampering via IPC channel to main process
- Optional: refuse to launch if integrity check fails (strict mode)

### `@commoners/secure-services`

**Purpose:** Authentication and access control for service communication.

**Features:**
- Generate per-session authentication tokens
- Inject tokens into service environment variables
- Middleware/wrapper for services to validate tokens
- Rate limiting for service requests
- Optional: Unix domain socket communication instead of TCP

### `@commoners/audit`

**Purpose:** Build-time security auditing across all language ecosystems.

**Features:**
- Run `npm audit` / `cargo audit` / `pip-audit` / `safety` during build
- Generate SBOM in CycloneDX or SPDX format
- Configurable severity thresholds (fail build on critical/high)
- Cache audit results to avoid repeated network calls
- Report in structured JSON format for CI integration

---

## 6. Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Service binary hash verification | Low | Critical — prevents tampered service execution |
| **P0** | Protocol handler origin validation | Low | High — prevents external protocol abuse |
| **P1** | Port randomization + PID verification | Medium | Medium — prevents local port hijacking |
| **P1** | IPC message schema validation | Medium | Medium — prevents injection attacks |
| **P1** | CSP audit and nonce injection | Low | Medium — hardens content loading |
| **P1** | Security test suite (`tests/security/`) | Medium | High — catches regressions |
| **P2** | `@commoners/integrity` plugin | Medium | High — comprehensive runtime verification |
| **P2** | `@commoners/secure-services` plugin | Medium | Medium — defense in depth for services |
| **P2** | Dependency audit CI integration | Low | Medium — catches known vulnerabilities |
| **P3** | `@commoners/audit` plugin with SBOM | High | Medium — supply chain visibility |
| **P3** | Build isolation (sandboxed compilation) | High | Medium — prevents build-time attacks |
| **P3** | Config validation mode | Low | Low — edge case mitigation |

---

## 7. File Inventory

| File | Action | Description |
|------|--------|-------------|
| `tests/security/` | Create | Security test suite directory |
| `tests/security/asar.test.ts` | Create | ASAR integrity verification tests |
| `tests/security/protocol.test.ts` | Create | Protocol handler security tests |
| `tests/security/ipc.test.ts` | Create | IPC message validation tests |
| `tests/security/services.test.ts` | Create | Service binary integrity tests |
| `packages/core/assets/electron/modules/protocol.ts` | Modify | Add origin validation |
| `packages/core/assets/electron/modules/ipc.ts` | Modify | Add message schema validation |
| `packages/core/assets/electron/security.ts` | Modify | CSP audit, nonce injection |
| `packages/core/assets/services/` | Modify | Binary hash verification, port randomization |
| `packages/plugins/integrity/` | Create | `@commoners/integrity` plugin |
| `packages/plugins/secure-services/` | Create | `@commoners/secure-services` plugin |
| `packages/plugins/audit/` | Create | `@commoners/audit` plugin |

---

## 8. Dependencies

- No external prerequisites for P0/P1 items
- `@commoners/audit` plugin depends on language-specific audit tools being installed
- Build isolation depends on container runtime (Docker) availability
- Blocks nothing on the main roadmap; can proceed in parallel

---

## 9. Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Security controls add startup latency (hash verification) | Lazy verification; verify on first access rather than startup |
| Token-based auth adds complexity for service developers | Provide middleware/wrappers; transparent when using Commoners service helpers |
| Build-time auditing slows CI | Cache results; run full audit on release only, quick check on PRs |
| Strict integrity mode breaks development workflow | Disable integrity checks in dev mode; only enforce in production builds |
| Over-securing prevents legitimate use cases | All controls should be configurable; strict defaults with opt-out |
| Multi-language audit tooling is fragile | Graceful degradation; skip unavailable auditors with warning |

---

## 10. Tier 1 Implementation Status

The following P0 fixes were implemented and merged. Test coverage gaps are listed for follow-up.

### Implemented

| Fix | Files | Status |
|-----|-------|--------|
| ASAR prelude parsing (12-byte) | `utils/asar/hash.ts` | Done |
| Strict mode for ASAR integrity | `utils/asar/security.ts`, `types.ts`, `ElectronBuildStrategy.ts` | Done |
| Protocol origin validation | `assets/electron/main.ts` | Done |
| Service binary hash verification | `ElectronBuildStrategy.ts`, `assets/electron/main.ts`, `assets/services/index.ts` | Done |
| Security audit events (hooks) | `types.ts`, `assets/electron/main.ts`, `assets/services/index.ts` | Done |
| Port PID verification | `assets/services/index.ts` (`verifyPortOwnership()`) | Done |
| SEA (Single Executable Application) | `utils/sea.ts` | Done |
| CSP header generation tests | `tests/security.test.ts` | Done |
| Protocol path handling tests | `tests/security.test.ts` | Done |
| IPC edge case tests | `tests/security.test.ts` | Done |
| Protocol E2E tests (desktop) | `tests/utils.ts` (`e2eTests.protocol`) | Done |

### Test Coverage Gaps

These items require platform-specific or integration testing:

| Gap | Reason | How to Test |
|-----|--------|-------------|
| Windows ASAR integrity embedding (strict errors) | Requires Windows + `ffi-napi`/`rcedit` | Windows CI runner with dependencies installed |
| Windows service binary `.exe` hashing | Extension detection differs on Windows | Windows CI runner with compiled services |
| ASAR prelude parsing against real `.asar` files | Needs an actual packaged Electron build | `pnpm demo:build` then inspect `.asar` header hashes |
| Strict mode throwing on missing dependencies | Needs electron-builder run without FFI/rcedit | Remove `ffi-napi` and run `pnpm demo:build` with `asarIntegrity: true` |
| Service hash manifest generation | Requires `ElectronBuildStrategy.build()` with compiled services | `pnpm demo:build` then verify `service-hashes.json` in build output |
| Service hash verification at runtime | Requires packaged Electron app with `service-hashes.json` | `pnpm demo:launch` after modifying a service binary — should fail |
| Security audit event emission | Requires Electron runtime with hooks listener | Manual: add `hooks.on('all', console.log)` and trigger security events |

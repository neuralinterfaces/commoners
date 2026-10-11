# Security Policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue or pull request.

Use GitHub's private vulnerability reporting: go to this repository's **Security** tab and select **Report a vulnerability**, or open [a new advisory](https://github.com/neuralinterfaces/commoners/security/advisories/new) directly.

Please include:
- the affected package(s) and version, or commit;
- the target (web/PWA, Electron, Tauri, iOS, Android) and OS;
- steps to reproduce, or a minimal project that shows the issue;
- what an attacker could do with it, as far as you know.

We will acknowledge the report, keep you informed while we investigate, and credit you in the advisory unless you prefer otherwise.

## Supported versions

Commoners is pre-1.0. Security fixes land on the latest release line; older alpha releases are not patched.

## Dependency advisories

CI runs `pnpm audit --audit-level=high` on every change, and it must pass. Advisories in dependencies are fixed by upgrading, or by pinning a patched version with a `pnpm.overrides` entry. An advisory is accepted only when no fix is usable. Accepted advisories are listed here and in `pnpm.auditConfig.ignoreGhsas`, each with its reason, and each entry is removed once a fix is available. None of them are in code that ships inside an app built with Commoners.

| Advisory | Package | Reached through | Why accepted |
|---|---|---|---|
| GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3 | extract-zip | webdriverio (optional dependency of `@commoners/testing`, for Tauri end-to-end tests) | No patched release exists |
| GHSA-vfj7-8cjw-p6xm | braces | `@changesets/cli` (release tooling, development only) | No patched release exists |
| GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w | sharp | `@capacitor/assets` (icon generation for mobile builds) | The fixed major is not accepted by `@capacitor/assets` |

## What Commoners does by default

See the [Security guide](./docs/guide/security.md): the controls that are on by default for each target, Electron's security checklist mapped item by item, and how to check a build.

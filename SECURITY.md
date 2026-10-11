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

## What Commoners does by default

See the [Security guide](./docs/guide/security.md): the controls that are on by default for each target, Electron's security checklist mapped item by item, and how to check a build.

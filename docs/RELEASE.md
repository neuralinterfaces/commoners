# Release Process

How to cut a new commoners release and publish it to npm. For the contributor PR flow (adding changesets to a feature branch), see [CONTRIBUTING.md](../CONTRIBUTING.md).

## When to cut a release

- **Pre-1.0 (current state):** alpha tags (`1.0.0-alpha.N`) are cut whenever a downstream consumer needs a fix or new feature merged on `dev`. There's no fixed cadence.
- **Post-1.0 (future):** patch / minor / major per semver, governed by accumulated changesets.

## Versioning model

All packages listed in `.changeset/config.json`'s `linked` array share a single version. Bumping `commoners` to `1.0.0-alpha.4` automatically bumps `@commoners/solidarity`, `@commoners/testing`, and the linked plugin packages to `1.0.0-alpha.4` as well. This avoids the cross-package version-drift problem and means consumers can pin a single version and get a consistent set.

## Two release paths

### Path A — Changeset-driven (preferred)

If contributors have been adding `pnpm changeset` entries to PRs as `CONTRIBUTING.md` describes:

```bash
git checkout dev
git pull

# Apply accumulated changesets to package versions + CHANGELOG entries.
# This rewrites packages/*/package.json, packages/*/CHANGELOG.md, and
# deletes the consumed .changeset/*.md entries.
pnpm changeset version

# Commit the version bump as its own commit
git add .
git commit -m "Version Packages"

# Build, publish, tag
pnpm release   # = pnpm build && changeset publish

# Changeset publish creates and pushes git tags for each released package.
# Verify on npm:
npm view @commoners/solidarity@<v> dist.tarball
npm view commoners@<v> dist.tarball
```

### Path B — Manual bump (current ad-hoc practice)

When no `.changeset/*.md` entries exist (e.g., 1.0.0-alpha.3 in `packages/*/package.json` was bumped manually without a changeset), publish directly:

```bash
git checkout dev
git pull

# Manually edit each linked package's package.json to the new version.
# Use a single sed/find-replace across packages/* to keep them in lockstep
# (the linked array enforces this at changeset-version time, but for a
# manual bump you have to enforce it yourself).

# Build first — pnpm publish skips this otherwise
pnpm build

# Publish all changed packages with public access
pnpm publish -F "./packages/**" --access public

# Tag the release commit so the npm version maps to a git SHA
git tag v<version>            # e.g., v1.0.0-alpha.4
git push origin v<version>
```

## Branch convention

`baseBranch` in `.changeset/config.json` is `main`, but in practice releases have been cut from `dev`. The current state of the project is small enough that `main` and `dev` move together. When the project formalizes a stable line (post-1.0), expect a clean dev → main fast-forward + tag-on-main pattern.

## Verification before announcing the release

- `npm view @commoners/solidarity versions | tail -3` lists the new version
- `npm view commoners@<v> dist.tarball` returns a URL (not 404)
- The git tag `v<version>` is on `origin`
- `packages/cli/CHANGELOG.md` and `packages/core/CHANGELOG.md` reflect the release (only meaningful when Path A was used; Path B doesn't update changelogs automatically)
- A clean checkout + `pnpm install commoners@<v>` resolves to the published tarball

## Why two paths exist

Changesets accumulate per-PR change descriptions and roll them into a release. They produce changelogs and ensure every published version has a documented set of changes. That audit trail matters for downstream consumers — particularly any consumer shipping into a regulated context that must cite specific dependency versions in a software bill of materials. The CHANGELOG is the diff a downstream reviewer would read to understand what changed.

The manual-bump path bypasses that audit trail. Use it when a downstream consumer needs an immediate fix and the changeset / changelog will be backfilled, but treat it as exceptional, not routine. The CHANGELOG entry should be added by hand if you skip the changeset step.

# Contributing to Commoners

Thanks for your interest in contributing! This guide covers the setup, workflow, and conventions for the project.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [PNPM](https://pnpm.io/) (install with `npm install -g pnpm`)
- [Conda](https://docs.conda.io/) (for running tests with Python services)
- `g++` compiler (for C++ service tests)
- Linux only: FUSE (`sudo apt-get install -y fuse`)

## Setup

```bash
# Clone the repository
git clone https://github.com/neuralinterfaces/commoners.git
cd commoners

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Development Workflow

### Monorepo Structure

| Directory | Package | Description |
|---|---|---|
| `packages/cli` | `commoners` | CLI tool |
| `packages/core` | `@commoners/solidarity` | Core framework |
| `packages/testing` | `@commoners/testing` | Testing utilities |
| `packages/plugins/` | `@commoners/*` | Device & desktop plugins |

### Common Commands

```bash
pnpm build            # Build all packages
pnpm test             # Run tests (Vitest)
pnpm lint             # Lint and auto-fix
pnpm lint:check       # Lint without fixing
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting
pnpm typecheck        # Type-check all packages
pnpm docs             # Start docs dev server
```

### Working on a Single Package

```bash
cd packages/core
pnpm build            # Build just this package
pnpm watch            # Rebuild on changes
```

## Testing

### Initial Setup

```bash
conda env create -f examples/demo/src/services/python/environment.yml
```

### Running Tests

Always activate the conda environment before running tests:

```bash
conda activate commoners-demo
pnpm test
```

## Commit Conventions

This project uses [lint-staged](https://github.com/lint-staged/lint-staged) with a pre-commit hook that runs ESLint and Prettier on staged files automatically.

Write clear, descriptive commit messages. Use imperative mood (e.g., "Add feature" not "Added feature").

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

When your PR includes user-facing changes, add a changeset:

```bash
pnpm changeset
```

This will prompt you to:
1. Select which packages are affected
2. Choose a semver bump type (patch / minor / major)
3. Write a summary of the change

The generated changeset file should be committed with your PR.

## Pull Request Process

1. Create a feature branch from `dev`
2. Make your changes
3. Add a changeset if applicable (`pnpm changeset`)
4. Ensure `pnpm build` and `pnpm test` pass
5. Submit a PR against `dev`

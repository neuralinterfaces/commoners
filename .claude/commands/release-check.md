Run the full pre-release checklist for the commoners monorepo. Execute each step sequentially and report results:

1. **Type check**: `pnpm typecheck`
2. **Lint check**: `pnpm lint:check`
3. **Build all packages**: `pnpm build`
4. **Run tests**: `pnpm test`
5. **Build docs**: `pnpm docs:build`
6. **Build demo**: `pnpm demo:build`

After all steps, provide a summary table showing pass/fail for each step and any issues that need attention before release.

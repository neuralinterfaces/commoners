#!/usr/bin/env node
// Local mirror of CI: rebuild every package, then check against those fresh builds.
//
// Tests import the built packages (dist/), so a stale build can fail or pass a test for the
// wrong reason. This rebuilds first, runs each step in order, stops at the first failure and
// prints what ran.
//
// Usage: pnpm ci:local            all steps
//        pnpm ci:local --no-tests build, lint, types and audit only

import { spawnSync } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const skipTests = process.argv.includes('--no-tests')

const steps = [
  ['Build every package', 'pnpm', ['build']],
  ['Lint', 'pnpm', ['lint:check']],
  ['Typecheck', 'pnpm', ['typecheck']],
  ...(skipTests ? [] : [['Full test suite', 'pnpm', ['exec', 'vitest', 'run']]]),
  ['Audit shipped packages', process.execPath, [join(root, 'scripts', 'audit-shipped.mjs')]],
]

const results = []
for (const [name, command, args] of steps) {
  console.log(`\n▶ ${name}: ${[command, ...args].join(' ')}`)
  const started = Date.now()
  const { status, error } = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  const seconds = Math.round((Date.now() - started) / 1000)
  const ok = status === 0 && !error
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} (${seconds}s)`)
  if (!ok) break
}

console.log(`\n${results.join('\n')}`)
if (results.length < steps.length) console.log(`Not run: ${steps.slice(results.length).map(s => s[0]).join(', ')}`)
process.exit(results.every(r => r.startsWith('PASS')) && results.length === steps.length ? 0 : 1)

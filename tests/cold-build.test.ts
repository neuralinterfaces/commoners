/**
 * Cold build regression test
 * Verifies that commoners can build a minimal project from scratch
 * without any pre-existing .commoners/ directory.
 *
 * Regression: script-hashes.json ENOENT when outDir doesn't exist yet
 */

import { describe, test, expect, afterAll } from 'vitest'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const repoRoot = process.cwd()
const commoners = join(repoRoot, 'node_modules', '.bin', 'commoners')
const benchDir = join(repoRoot, 'examples', 'bench')
const benchOutDir = join(benchDir, '.commoners', 'web')

describe('Cold Build (no prior state)', () => {
  afterAll(() => {
    if (existsSync(join(benchDir, '.commoners'))) rmSync(join(benchDir, '.commoners'), { recursive: true })
    // Also clean up the root .commoners/ that script-hashes writes to
    if (existsSync(join(repoRoot, '.commoners'))) rmSync(join(repoRoot, '.commoners'), { recursive: true })
  })

  test('web build succeeds from bench example with no prior .commoners/', () => {
    // Ensure clean state
    if (existsSync(join(benchDir, '.commoners'))) rmSync(join(benchDir, '.commoners'), { recursive: true })

    // Build from scratch — must not throw ENOENT for script-hashes.json
    execSync(`${commoners} build ${benchDir} --target web`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: repoRoot,
      env: { ...process.env },
    })

    // Verify output was created
    expect(existsSync(benchOutDir)).toBe(true)
    expect(existsSync(join(benchOutDir, 'index.html'))).toBe(true)
  })

  test('build output includes commoners assets', () => {
    const assetsDir = join(benchOutDir, 'assets')
    expect(existsSync(assetsDir)).toBe(true)

    // Should have onload.mjs, config files, and icon
    const files = require('node:fs').readdirSync(assetsDir)
    expect(files.some((f: string) => f.startsWith('onload-'))).toBe(true)
    expect(files.some((f: string) => f.startsWith('commoners.config'))).toBe(true)
  })
})

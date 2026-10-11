import { describe, test, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The built CLI, run as a separate process the way users run it. A CLI that fails to load must
// say so and exit non-zero; one that loads must answer --version and --help, including with
// colours on (the terminal UI loads chalk only when colours are enabled)

const repo = join(__dirname, '..')
const cli = join(repo, 'packages', 'cli', 'dist', 'index.cjs')
const version = JSON.parse(
  readFileSync(join(repo, 'packages', 'cli', 'package.json'), 'utf8')
).version

const run = (args: string[], env: Record<string, string> = {}, preload?: string) =>
  spawnSync(process.execPath, [...(preload ? ['-r', preload] : []), cli, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, NODE_PATH: '', ...env },
  })

describe.skipIf(!existsSync(cli))('built CLI', () => {
  for (const color of ['0', '1'])
    test(`--version and --help work with FORCE_COLOR=${color}`, () => {
      const v = run(['--version'], { FORCE_COLOR: color })
      expect(v.status, v.stderr).toBe(0)
      expect(v.stdout).toContain(version)
      const h = run(['--help'], { FORCE_COLOR: color })
      expect(h.status, h.stderr).toBe(0)
      expect(h.stdout).toMatch(/build/)
    })

  test('a crash exits non-zero and shows the error, instead of ending silently', () => {
    const result = run(
      ['--version'],
      { COMMONERS_BLOCK_MODULES: 'cac' },
      join(__dirname, 'fixtures', 'block-module.cjs')
    )
    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/Cannot find module 'cac'/)
  })
})

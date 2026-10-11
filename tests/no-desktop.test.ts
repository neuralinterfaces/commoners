import { describe, test, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// A web-only app has no desktop toolchain installed. Run the real CLI with electron,
// electron-builder and vite-plugin-pwa made unresolvable (tests/fixtures/block-desktop.cjs)

const repo = join(__dirname, '..')
const cli = join(repo, 'packages', 'cli', 'dist', 'index.cjs')
const preload = join(__dirname, 'fixtures', 'block-desktop.cjs')
const example = join(repo, 'examples', 'features')

const run = (args: string[]) =>
  spawnSync(process.execPath, ['-r', preload, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, FORCE_COLOR: '0' },
  })

describe('without desktop tooling installed', () => {
  // Positive control: the preload really does hide the packages
  test('electron cannot be resolved', () => {
    const result = run(['-e', "require.resolve('electron')"])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Cannot find module 'electron'/)
  })

  test.skipIf(!existsSync(cli))(
    'a web build succeeds',
    () => {
      const outDir = join(example, '.commoners', 'no-desktop-web')
      rmSync(outDir, { recursive: true, force: true })
      const result = run([cli, 'build', example, '--target', 'web', '--outDir', outDir])
      expect(result.status, result.stderr).toBe(0)
      expect(existsSync(join(outDir, 'index.html'))).toBe(true)
      rmSync(outDir, { recursive: true, force: true })
    },
    120000
  )

  test.skipIf(!existsSync(cli))(
    'a desktop build stops and says what to install',
    () => {
      const result = run([cli, 'build', example, '--target', 'electron'])
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toMatch(
        /npm install --save-dev electron electron-builder/
      )
    },
    120000
  )
})

import { describe, test, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// A config that reads process.env at top level (examples/app-origin does) must still load in the
// page: there is no `process` in a browser or a sandboxed Electron renderer. If the page's copy
// of the config referenced process.env, it would throw there and READY would never resolve

const repo = join(__dirname, '..')
const cli = join(repo, 'packages', 'cli', 'dist', 'index.cjs')
const example = join(repo, 'examples', 'app-origin')
const outDir = join(example, '.commoners', 'browser-config-test')

describe.skipIf(!existsSync(cli))("the page's copy of the config", () => {
  test('does not reference process.env', () => {
    expect(readFileSync(join(example, 'commoners.config.ts'), 'utf8')).toMatch(/process\.env/) // Precondition
    rmSync(outDir, { recursive: true, force: true })
    const result = spawnSync(
      process.execPath,
      [cli, 'build', example, '--target', 'web', '--outDir', outDir],
      { cwd: repo, encoding: 'utf8', timeout: 120000, env: { ...process.env, NODE_PATH: '' } }
    )
    expect(result.status, result.stderr).toBe(0)
    const bundle = readdirSync(join(outDir, 'assets')).find(f =>
      /^commoners\.config-.*\.mjs$/.test(f)
    )
    expect(bundle).toBeDefined()
    expect(readFileSync(join(outDir, 'assets', bundle!), 'utf8')).not.toMatch(/\bprocess\.env\b/)
    rmSync(outDir, { recursive: true, force: true })
  }, 120000)
})

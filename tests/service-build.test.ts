import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { buildServices } from '../packages/core/build'

// A service whose build is a shell command. The command writes what it saw to a file so the
// test can check the environment the build actually ran with.
const makeProject = () => {
  const root = mkdtempSync(join(tmpdir(), 'commoners-service-build-'))
  writeFileSync(join(root, 'index.html'), '<html><head></head><body></body></html>')
  return root
}

const node = JSON.stringify(process.execPath)

describe('Service build commands', () => {
  let root: string
  const secret = 'COMMONERS_TEST_PARENT_ONLY'

  beforeEach(() => {
    root = makeProject()
    process.env[secret] = 'parent-value'
  })

  afterEach(() => {
    delete process.env[secret]
    rmSync(root, { recursive: true, force: true })
  })

  test('run with HOME, the toolchain variables and the declared service env', async () => {
    const report = join(root, 'env.json')
    const out = join(root, 'svc-out')
    const script = `require('fs').writeFileSync(${JSON.stringify(report)}, JSON.stringify(process.env)); require('fs').writeFileSync(${JSON.stringify(out)}, '')`
    writeFileSync(join(root, 'build.cjs'), script)

    await buildServices(
      {
        root,
        target: 'tauri',
        services: {
          svc: {
            src: out,
            build: `${node} ./build.cjs`,
            env: { DECLARED_FOR_SERVICE: 'yes' },
          },
        },
      } as any,
      { dev: false }
    )

    expect(existsSync(report), 'build command did not run').toBe(true)
    const seen = JSON.parse(readFileSync(report, 'utf8'))
    expect(seen.HOME).toBe(process.env.HOME)
    expect(seen.PATH).toContain(process.env.PATH!.split(':')[0])
    expect(seen.DECLARED_FOR_SERVICE).toBe('yes')
    // Only an allowlist of the parent env is inherited, so unrelated secrets stay out of builds
    expect(seen[secret]).toBeUndefined()
  })
})

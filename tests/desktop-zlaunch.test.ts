import { describe, test, expect, beforeAll, afterAll } from 'vitest'

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build, open } from '@commoners/testing'
import testingPlugin from '@commoners/testing/plugin'

import { registerBuildTest, scopedBuildOutDir } from './utils'

const { platform } = process

const platforms = {
  mac: platform === 'darwin',
  windows: platform === 'win32',
}

const enabled = platforms.mac || platforms.windows

// Builds the Electron app then launches it for E2E testing.
// Runs AFTER desktop.test.ts (alphabetically) to avoid CDP port conflicts.
describe('Desktop Build + Launch', () => {
  registerBuildTest('Desktop', { target: 'electron', launch: true }, enabled)
})

// The packaged app serves its pages from app://local, not file://. Checked on the launched app:
// the page origin, cross-origin isolation (needs response headers, which file:// cannot carry),
// and that the page cannot read local files through file://
const appOriginRoot = join(__dirname, '..', 'examples', 'app-origin')

describe.runIf(enabled)('App origin (packaged Electron)', () => {
  const opts: Parameters<typeof build>[1] = {
    target: 'electron',
    outDir: scopedBuildOutDir,
    plugins: { __testing: testingPlugin({ remoteDebuggingPort: 8315 }) },
  }

  let output: Awaited<ReturnType<typeof build>> | undefined
  let launched: Awaited<ReturnType<typeof open>> | undefined

  beforeAll(async () => {
    output = await build(appOriginRoot, opts)
    launched = await open(appOriginRoot, opts, true)
  }, 600_000)

  afterAll(async () => {
    await launched?.cleanup()
    await output?.cleanup()
  })

  test('page is served from app://local/', async () => {
    const href = await launched!.page.evaluate(() => location.href)
    expect(href.startsWith('app://local/'), `page loaded from ${href}`).toBe(true)
  })

  test('page is cross-origin isolated', async () => {
    const isolated = await launched!.page.evaluate(() => globalThis.crossOriginIsolated)
    expect(isolated).toBe(true)
  })

  test('page cannot fetch a local file through file://', async () => {
    expect(existsSync(__filename)).toBe(true) // The target exists, so a failure is the origin's doing
    const target = pathToFileURL(__filename).href
    const result = await launched!.page.evaluate(async url => {
      try {
        const res = await fetch(url)
        return { ok: true, status: res.status }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }, target)
    expect(result.ok, `fetch(${target}) returned ${JSON.stringify(result)}`).toBe(false)
  })
})

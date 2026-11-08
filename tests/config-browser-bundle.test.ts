import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { bundleConfig } from '../packages/core/utils/assets'

// The page receives a browser bundle of commoners.config, but the same file also holds
// build-time settings (vite plugins, service builds) that use Node. Node-only imports there
// must not break the page bundle, and must not end up in it.

const dir = mkdtempSync(join(tmpdir(), 'commoners-config-browser-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const write = (name: string, source: string) => {
  const path = join(dir, name)
  writeFileSync(path, source)
  return path
}

const bundleForBrowser = async (configSource: string, name: string) => {
  const input = write(`${name}.config.js`, configSource)
  const outFile = join(dir, `${name}.out.mjs`)
  await bundleConfig(input, outFile, { target: 'web' })
  return { outFile, code: readFileSync(outFile, 'utf8') }
}

const NODE_ONLY_CONFIG = `
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'crypto'
import { EventEmitter } from 'node:events'
import { cpus } from 'os'

export default {
  name: 'Node-only build settings',
  vite: {
    plugins: [{
      name: 'model',
      async configureServer() {
        const bytes = await readFile('model.bin')
        createHash('sha256').update(readFileSync('model.bin')).digest('hex')
        new EventEmitter().emit('cores', cpus().length, bytes)
      },
    }],
  },
  plugins: { greet: { load() { return 'hello from the page' } } },
}
`

describe('Browser config bundle', () => {
  test('a config with node-only named imports in its build settings still bundles', async () => {
    await expect(bundleForBrowser(NODE_ONLY_CONFIG, 'node-only')).resolves.toBeTruthy()
  })

  test('the page bundle keeps plugins but carries no node imports or build-time code', async () => {
    const { outFile, code } = await bundleForBrowser(NODE_ONLY_CONFIG, 'node-only-contents')
    expect(code).not.toMatch(/from\s*["'](node:)?(fs|crypto|events|os)/)
    expect(code).not.toContain('configureServer')

    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe('hello from the page')
    expect(config.vite).toBeUndefined()
  })

  test('a plugin that calls node-only code in the page fails with a clear message', async () => {
    const { outFile } = await bundleForBrowser(
      `import { readFileSync } from 'node:fs/promises'
       export default { plugins: { bad: { load() { return readFileSync('x') } } } }`,
      'node-in-plugin'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(() => config.plugins.bad.load()).toThrow(/node:fs\/promises.*not available in the page/)
  })
})

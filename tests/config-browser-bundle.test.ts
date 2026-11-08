import { afterAll, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

  test('top-level path code used only by build settings stays out of the page bundle', async () => {
    const { code } = await bundleForBrowser(
      `import { dirname, join } from 'node:path'
       import { fileURLToPath } from 'node:url'
       const here = dirname(fileURLToPath(import.meta.url))
       const modelPath = join(here, 'model-for-build-only.json')
       export default {
         vite: { plugins: [{ name: 'model', configureServer() { return modelPath } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'top-level-path'
    )
    expect(code).not.toContain('model-for-build-only.json')
    expect(code).not.toContain(dir) // The developer's absolute project path
  })

  test('namespace path imports in a TypeScript config are dropped too', async () => {
    const input = write(
      'ts-namespace.config.ts',
      `import * as path from 'node:path'
       import url from 'node:url'
       const root: string = path.dirname(url.fileURLToPath(import.meta.url))
       const model: string = path.join(root, 'ts-build-only.json')
       export default {
         vite: { plugins: [{ name: 'model', configureServer: () => model }] },
         plugins: { greet: { load: (): string => 'hello' } },
       }`
    )
    const outFile = join(dir, 'ts-namespace.out.mjs')
    await bundleConfig(input, outFile, { target: 'web' })
    const code = readFileSync(outFile, 'utf8')
    expect(code).not.toContain('ts-build-only.json')
    expect(code).not.toContain(dir)
  })

  test('import.meta.url in a page plugin is the page bundle URL, not the source file', async () => {
    const { outFile, code } = await bundleForBrowser(
      `export default {
         plugins: {
           here: { load() { return { url: import.meta.url, asset: new URL('./x.png', import.meta.url).href } } },
         },
       }`,
      'page-import-meta'
    )
    expect(code).not.toContain(dir) // The developer's absolute project path
    expect(code).not.toContain(pathToFileURL(dir).href)

    // Resolved by the runtime against wherever the bundle was loaded from
    const config = (await import(pathToFileURL(outFile).href)).default
    const { url, asset } = config.plugins.here.load()
    expect(url).toMatch(/^file:\/\/.*\/page-import-meta\.out\.mjs$/) // The bundle, not the source
    expect(asset).toBe(new URL('./x.png', url).href)
  })

  test('a page plugin that uses a source-relative directory loads without the project path', async () => {
    const { outFile, code } = await bundleForBrowser(
      `import { dirname } from 'node:path'
       import { fileURLToPath } from 'node:url'
       const root = dirname(fileURLToPath(import.meta.url))
       export default { plugins: { where: { load() { return root } } } }`,
      'used-dirname'
    )
    expect(code).not.toContain(dir)
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.where.load()).toBeTypeOf('string')
  })

  test('a path call the page plugin uses still runs in the page', async () => {
    const { outFile } = await bundleForBrowser(
      `import { join } from 'node:path'
       const base = join('assets', 'icons')
       export default { plugins: { icons: { load() { return join(base, 'a.png') } } } }`,
      'used-path'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.icons.load()).toBe('assets/icons/a.png')
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

// A third-party package written for Node (it imports Node built-ins and runs code when it is
// imported) that the config uses only in build settings must not reach the page: its top-level
// code would run there against the built-in stub and stop the app from loading.
describe('Browser config bundle: Node-only dependencies', () => {
  const pkg = (name: string, manifest: Record<string, unknown>, source: string) => {
    const root = join(dir, 'node_modules', name)
    mkdirSync(root, { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js', ...manifest })
    )
    writeFileSync(join(root, 'index.js'), source)
  }

  // Calls into node:fs while it is being imported, like a package that reads a file on load
  pkg(
    'node-only-on-load',
    {},
    `import { readFileSync } from 'node:fs'
     globalThis.__nodeOnlyOnLoad = readFileSync('/etc/hosts', 'utf8').length
     export const marker = 'NODE_ONLY_ON_LOAD_MARKER'
     export const readMarker = p => marker + readFileSync(p, 'utf8').length`
  )

  // Same shape, but its load-time code is safe to run in the page
  pkg(
    'node-only-safe-load',
    {},
    `import { readFileSync } from 'node:fs'
     globalThis.__nodeOnlySafeLoad = 'ran'
     export const marker = 'NODE_ONLY_SAFE_LOAD_MARKER'
     export const readMarker = p => marker + readFileSync(p, 'utf8').length`
  )

  // Declares its own side effects, which the bundle must keep honouring
  pkg(
    'node-only-declared',
    { sideEffects: true },
    `import { readFileSync } from 'node:fs'
     globalThis.__nodeOnlyDeclared = 'NODE_ONLY_DECLARED_MARKER'
     export const readMarker = p => readFileSync(p, 'utf8')`
  )

  // A browser package imported only for what it does on load (polyfill, element registration)
  pkg(
    'browser-registers-on-load',
    {},
    `globalThis.__browserRegistered = 'BROWSER_REGISTERED_MARKER'`
  )

  test('a Node-only dependency used only in a vite hook leaves no trace and the page loads', async () => {
    const { outFile, code } = await bundleForBrowser(
      `import { marker, readMarker } from 'node-only-on-load'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { console.log(readMarker('x'), marker) } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'node-only-dep-build-only'
    )
    expect(code).not.toContain('NODE_ONLY_ON_LOAD_MARKER')
    expect(code).not.toContain('__nodeOnlyOnLoad')
    expect(code).not.toContain('/etc/hosts')

    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe('hello')
    expect(globalThis).not.toHaveProperty('__nodeOnlyOnLoad')
  })

  test('the same kind of dependency used by a page plugin is still bundled and runs', async () => {
    const { outFile, code } = await bundleForBrowser(
      `import { marker } from 'node-only-safe-load'
       export default { plugins: { greet: { load() { return marker } } } }`,
      'node-only-dep-page-use'
    )
    expect(code).toContain('NODE_ONLY_SAFE_LOAD_MARKER')
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe('NODE_ONLY_SAFE_LOAD_MARKER')
    expect((globalThis as any).__nodeOnlySafeLoad).toBe('ran') // Its load-time code ran too
  })

  test('a dependency that declares sideEffects keeps them', async () => {
    const { code } = await bundleForBrowser(
      `import { readMarker } from 'node-only-declared'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { readMarker('x') } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'node-only-dep-declared'
    )
    expect(code).toContain('NODE_ONLY_DECLARED_MARKER')
  })

  test('a browser package imported for its load-time effect is kept', async () => {
    const { code } = await bundleForBrowser(
      `import 'browser-registers-on-load'
       export default { plugins: { greet: { load() { return 'hello' } } } }`,
      'browser-side-effect-import'
    )
    expect(code).toContain('BROWSER_REGISTERED_MARKER')
  })
})

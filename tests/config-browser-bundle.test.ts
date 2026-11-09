import { afterAll, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { bundleConfig } from '../packages/core/utils/assets'

// The page receives a browser bundle of commoners.config, but the same file also holds
// build-time settings (vite plugins, service builds) that use Node. Node-only imports there
// must not break the page bundle, and must not end up in it.

const dir = mkdtempSync(join(tmpdir(), 'commoners-config-browser-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const write = (name: string, source: string) => {
  const path = join(dir, name)
  mkdirSync(dirname(path), { recursive: true })
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
      `import { dirname, join } from 'node:path'
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

// A third-party package with no browser build, imported by the config for its build settings.
// Its top-level code stays in the page bundle (it may have load-time effects the page needs),
// so a built-in it calls at load fails in the page. That failure must name the package and the
// fix, and the page bundle must keep everything it kept before: nothing is dropped.
const SIDE_EFFECT = 'globalThis.__FIXTURE_SIDE_EFFECT__ = readFileSync.name'
const MARKER = 'FIXTURE_MARKER_5c1e'
const packageSource = (loadTime: string) => `import { readFileSync } from 'node:fs'
${loadTime}
export const marker = '${MARKER}'
export const readSize = p => readFileSync(p, 'utf8').length
`
const addPackage = (name: string, loadTime: string) => {
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js' })
  )
  write(`node_modules/${name}/index.js`, packageSource(loadTime))
  // The same code as a file of the project itself, which the page bundle has always stubbed
  // without naming anyone
  write(`local/${name}.js`, packageSource(loadTime))
}
addPackage('reads-at-build', SIDE_EFFECT)
addPackage('calls-at-load', `globalThis.__FIXTURE_LOADED__ = readFileSync('/x', 'utf8')`)

const configUsing = (from: string, { pageUse = false } = {}) => `
import { marker, readSize } from '${from}'
export default {
  vite: { plugins: [{ name: 'size', configResolved() { console.log(readSize('package.json'), marker) } }] },
  plugins: { greet: { load() { return ${pageUse ? 'marker' : "'hello'"} } } },
}`

// The stub's message is the only text allowed to differ between the two bundles. The bundler
// shortens local names by how often each letter appears, so a longer message can give the same
// code other short names: compare with names numbered in order of first use.
const TOKEN =
  /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|([A-Za-z_$][\w$]*)|([^])/g
const sameCodeAs = (code: string) => {
  const names = new Map<string, string>()
  return code.replace(TOKEN, (token, string, name) => {
    if (string) return string.includes('is not available in the page') ? '<message>' : string
    if (name) {
      if (!names.has(name)) names.set(name, `n${names.size}`)
      return names.get(name)
    }
    return token
  })
}

describe('Node-only packages imported by the config', () => {
  const cases = [
    ['used only in a vite hook', 'reads-at-build', {}],
    ['used by a page plugin', 'reads-at-build', { pageUse: true }],
    ['calling a built-in at load', 'calls-at-load', {}],
  ] as const

  test.each(cases)(
    'a package %s keeps the same page bundle as the same code in a project file',
    async (_, name, options) => {
      const fromPackage = await bundleForBrowser(
        configUsing(name, options),
        `pkg-${name}-${!!options.pageUse}`
      )
      const fromProject = await bundleForBrowser(
        configUsing(`./local/${name}.js`, options),
        `local-${name}-${!!options.pageUse}`
      )
      expect(sameCodeAs(fromPackage.code)).toBe(sameCodeAs(fromProject.code))
      // Load-time code is kept, and so is what the page plugin uses
      expect(fromPackage.code).toContain('globalThis.__FIXTURE_')
      if (options.pageUse) expect(fromPackage.code).toContain(MARKER)
    }
  )

  test('a package used by a page plugin still works in the page', async () => {
    const { outFile } = await bundleForBrowser(
      configUsing('reads-at-build', { pageUse: true }),
      'pkg-page-run'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe(MARKER)
  })

  test('a package that calls a built-in in the page is named, with the fix', async () => {
    const { outFile } = await bundleForBrowser(configUsing('calls-at-load'), 'pkg-call-message')
    const failure = await import(pathToFileURL(outFile).href).then(
      () => null,
      (error: Error) => error.message
    )
    expect(failure).toMatch(/^node:fs \(readFileSync\) is not available in the page\./)
    expect(failure).toContain('"calls-at-load" package')
    expect(failure).toContain("await import('calls-at-load')")
  })

  test('the same call from a project file names no package', async () => {
    const { outFile } = await bundleForBrowser(
      configUsing('./local/calls-at-load.js'),
      'local-call-message'
    )
    const failure = await import(pathToFileURL(outFile).href).then(
      () => null,
      (error: Error) => error.message
    )
    expect(failure).toBe(
      'node:fs (readFileSync) is not available in the page. Keep Node-only code in build settings, not in plugins the page runs.'
    )
  })

  // The documented fix: load the package inside the hook that needs it
  const lazyConfig = (desktopHook = '') => `
export default {
  vite: { plugins: [{ name: 'size', async configResolved() {
    const { readSize, marker } = await import('calls-at-load')
    console.log(readSize('package.json'), marker)
  } }] },
  plugins: { greet: { load() { return 'hello' }${desktopHook} } },
}`

  test('loading the package inside the hook keeps it out of the page, which loads', async () => {
    const input = write('lazy-page.config.js', lazyConfig())
    const outFile = join(dir, 'lazy-page.out.mjs')
    const outputs = await bundleConfig(input, outFile, { target: 'web' })
    expect(outputs).toEqual([outFile]) // No separate chunk for the package either
    const code = readFileSync(outFile, 'utf8')
    expect(code).not.toContain(MARKER)
    expect(code).not.toContain('__FIXTURE_LOADED__')
    expect(code).not.toContain('calls-at-load')
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe('hello')
    expect(config.vite).toBeUndefined()
  })

  test('the same pattern works in the desktop (Node) bundle', async () => {
    const input = write(
      'lazy-node.config.js',
      lazyConfig(
        `, async start() { const { marker } = await import('reads-at-build'); return marker }`
      )
    )
    const outFile = join(dir, 'lazy-node.out.cjs')
    await bundleConfig(input, outFile, { node: true, desktop: true, target: 'electron' })
    const loaded = createRequire(import.meta.url)(outFile)
    const config = loaded.default ?? loaded
    expect(config.vite).toBeUndefined()
    expect(await config.plugins.greet.start()).toBe(MARKER)
  })
})

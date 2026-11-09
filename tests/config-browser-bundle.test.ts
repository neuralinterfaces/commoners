import { afterAll, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
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
      `import { basename, dirname, join } from 'node:path'
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
      `import { basename, dirname, join } from 'node:path'
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
// so a built-in it calls at load fails in the page. That failure must name the package the
// config imports and the fix, and nothing else about the page bundle may change: same files,
// same chunks, same code, one shared stub per built-in.
const MARKER = 'FIXTURE_MARKER_5c1e'
const SIDE_EFFECT = 'globalThis.__FIXTURE_SIDE_EFFECT__ = readFileSync.name'
const CALL_AT_LOAD = `globalThis.__FIXTURE_LOADED__ = readFileSync('/x', 'utf8')`
const packageSource = (loadTime: string, extra = '') => `import { readFileSync } from 'node:fs'
${extra}
${loadTime}
export const marker = '${MARKER}'
export const readSize = p => readFileSync(p, 'utf8').length
`
const addPackage = (
  name: string,
  source: string,
  { main = 'index.js', at = `node_modules/${name}` } = {}
) => {
  write(`${at}/package.json`, JSON.stringify({ name, version: '1.0.0', type: 'module', main }))
  write(`${at}/${main}`, source)
}

// The project itself has a named package.json: its own files are never a package
write('package.json', JSON.stringify({ name: 'fixture-app', private: true }))
addPackage('reads-at-build', packageSource(SIDE_EFFECT))
addPackage('calls-at-load', packageSource(CALL_AT_LOAD))
addPackage('@fixture-scope/scoped-calls', packageSource(CALL_AT_LOAD))
// Only the package the config imports can be fixed by the config
addPackage('e-inner', packageSource(CALL_AT_LOAD), {
  at: 'node_modules/e-outer/node_modules/e-inner',
})
addPackage('e-outer', `export * from 'e-inner'\n`)
// A package with a named manifest inside it
addPackage('f-named', `export * from './esm/index.js'\n`)
write(
  'node_modules/f-named/esm/package.json',
  JSON.stringify({ name: 'f-named-esm-internal', type: 'module' })
)
write('node_modules/f-named/esm/index.js', packageSource(CALL_AT_LOAD))
// A package that keeps the built-in it imported
addPackage('keeps-fs', `import fs from 'node:fs'\nexport const packageFs = fs\n`)
addPackage(
  'crypto-at-load',
  `import { createHash } from 'node:crypto'\nglobalThis.__FIXTURE_HASH__ = createHash('sha256')\n`
)
addPackage(
  'k-dyn',
  `import { readFileSync } from 'node:fs'\nexport const kind = typeof readFileSync\n`
)
// Project files, including a subfolder with its own named package.json
write('local/calls-at-load.js', packageSource(CALL_AT_LOAD))
write('local/reads-at-build.js', packageSource(SIDE_EFFECT))
write('sub/package.json', JSON.stringify({ name: 'my-sub', type: 'module' }))
write('sub/index.js', packageSource(CALL_AT_LOAD))

const configUsing = (from: string, { pageUse = false } = {}) => `
import { marker, readSize } from '${from}'
export default {
  vite: { plugins: [{ name: 'size', configResolved() { console.log(readSize('package.json'), marker) } }] },
  plugins: { greet: { load() { return ${pageUse ? 'marker' : "'hello'"} } } },
}`

// Bundle into a folder of its own and return every file it wrote
const bundleInto = async (
  configSource: string,
  name: string,
  options: Record<string, unknown> = {}
) => {
  const input = write(`${name}.config.js`, configSource)
  const outDir = join(dir, 'out', name)
  const outFile = join(outDir, 'config.mjs')
  const outputs: string[] = await bundleConfig(input, outFile, { target: 'web', ...options })
  const files = Object.fromEntries(
    outputs.map(file => [basename(file), readFileSync(file, 'utf8')] as const)
  )
  return { outFile, outDir, files }
}

// The stub's message is the only text allowed to differ
const STUB_MESSAGE =
  /(["'`])(?:(?!\1)[^\\]|\\.)*?is not available in the page\.(?:(?!\1)[^\\]|\\.)*\1/g
const masked = (files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, v.replace(STUB_MESSAGE, '<message>')])
  )

const loadFailure = (outFile: string) =>
  import(pathToFileURL(outFile).href).then(
    () => null,
    (error: Error) => error.message
  )

const PROJECT_MESSAGE =
  'node:fs (readFileSync) is not available in the page. Keep Node-only code in build settings, not in plugins the page runs.'

describe('Node-only packages imported by the config', () => {
  const DYNAMIC_CONFIG = `
import { readFileSync } from 'node:fs'
export default {
  plugins: { a: { load() { return typeof readFileSync }, async start() { return (await import('k-dyn')).kind } } },
}`
  const IDENTITY_CONFIG = `
import fs from 'node:fs'
import { packageFs } from 'keeps-fs'
export default { plugins: { same: { load() { return fs === packageFs } } } }`

  const cases: [string, string][] = [
    ['a package used only in a vite hook', configUsing('reads-at-build')],
    ['a package used by a page plugin', configUsing('reads-at-build', { pageUse: true })],
    ['a package that calls a built-in at load', configUsing('calls-at-load')],
    ['a scoped package', configUsing('@fixture-scope/scoped-calls')],
    ['a package reached through another', configUsing('e-outer')],
    ['the config and a dynamically imported package', DYNAMIC_CONFIG],
    ['the config and a package keeping the same built-in', IDENTITY_CONFIG],
  ]

  test.each(cases)('%s: same files and code as without package names', async (label, source) => {
    const slug = label.replace(/\W+/g, '-')
    const named = await bundleInto(source, `named-${slug}`)
    const plain = await bundleInto(source, `plain-${slug}`, { nameNodeOnlyPackages: false })
    expect(Object.keys(named.files).sort()).toEqual(Object.keys(plain.files).sort())
    expect(masked(named.files)).toEqual(masked(plain.files))
  })

  test('without package names, the page bundle is the bundle from before this change', async () => {
    // The stub as it was: one module per built-in with the original message
    const { files } = await bundleInto(configUsing('calls-at-load'), 'plain-original', {
      nameNodeOnlyPackages: false,
    })
    const code = Object.values(files).join('\n')
    expect(code).toContain(
      'is not available in the page. Keep Node-only code in build settings, not in plugins the page runs.'
    )
    expect(code).toContain('globalThis.__FIXTURE_LOADED__')
  })

  test('one shared stub per built-in, even across chunks', async () => {
    const { files } = await bundleInto(DYNAMIC_CONFIG, 'dynamic-shared')
    expect(Object.keys(files).length).toBeGreaterThan(1) // The dynamic import is its own chunk
    const all = Object.values(files).join('\n')
    expect(all.match(/is not available in the page/g)).toHaveLength(1)
  })

  test('the package and the config get the same built-in object', async () => {
    const { outFile } = await bundleInto(IDENTITY_CONFIG, 'identity')
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.same.load()).toBe(true)
  })

  test('a package used by a page plugin still works in the page', async () => {
    const { outFile } = await bundleInto(
      configUsing('reads-at-build', { pageUse: true }),
      'page-run'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe(MARKER)
  })

  const named = (pkg: string) => [
    `"${pkg}" package, which commoners.config imports`,
    `await import('${pkg}')`,
  ]

  test.each([
    ['a package', 'calls-at-load', 'calls-at-load'],
    ['a scoped package', '@fixture-scope/scoped-calls', '@fixture-scope/scoped-calls'],
    ['a package reached through another, by the one the config imports', 'e-outer', 'e-outer'],
    ['a package with a named manifest inside it, by its own name', 'f-named', 'f-named'],
  ])('%s that calls a built-in in the page is named, with the fix', async (_, from, pkg) => {
    const { outFile } = await bundleInto(configUsing(from), `message-${pkg.replace(/\W+/g, '-')}`)
    const failure = await loadFailure(outFile)
    expect(failure).toMatch(/^node:fs \(readFileSync\) is not available in the page\./)
    for (const text of named(pkg)) expect(failure).toContain(text)
    for (const wrong of ['e-inner', 'f-named-esm-internal', 'fixture-app'])
      expect(failure).not.toContain(wrong)
  })

  test.each([
    ['a project file', './local/calls-at-load.js'],
    ['a project subfolder with its own package.json', './sub/index.js'],
  ])('the same call from %s names no package', async (label, from) => {
    const { outFile } = await bundleInto(configUsing(from), `project-${label.replace(/\W+/g, '-')}`)
    expect(await loadFailure(outFile)).toBe(PROJECT_MESSAGE)
  })

  test('a project inside a node_modules folder, opened through a link, names only its packages', async () => {
    const app = join(dir, 'node_modules', 'inside-app')
    mkdirSync(join(app, 'node_modules', 'calls-at-load'), { recursive: true })
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'inside-app', type: 'module' }))
    writeFileSync(
      join(app, 'node_modules', 'calls-at-load', 'package.json'),
      JSON.stringify({ name: 'calls-at-load', type: 'module', main: 'index.js' })
    )
    writeFileSync(
      join(app, 'node_modules', 'calls-at-load', 'index.js'),
      packageSource(CALL_AT_LOAD)
    )
    writeFileSync(join(app, 'commoners.config.js'), configUsing('calls-at-load'))
    const link = join(dir, 'linked-inside-app')
    symlinkSync(app, link, 'dir')
    const outFile = join(dir, 'out', 'inside-node-modules', 'config.mjs')
    await bundleConfig(join(link, 'commoners.config.js'), outFile, { target: 'web' })
    const failure = await loadFailure(outFile)
    expect(failure).toContain('"calls-at-load" package')
    expect(failure).not.toContain('inside-app')
  })

  test('each built-in names only the packages that reach it', async () => {
    const { outFile } = await bundleInto(
      `import { marker } from 'reads-at-build'
       import 'crypto-at-load'
       export default { plugins: { greet: { load() { return marker } } } }`,
      'per-builtin'
    )
    const failure = await loadFailure(outFile)
    expect(failure).toMatch(/^node:crypto \(createHash\) is not available in the page\./)
    expect(failure).toContain('"crypto-at-load" package')
    expect(failure).not.toContain('reads-at-build')
  })

  test('a built-in the config also uses itself says so', async () => {
    const { outFile } = await bundleInto(
      `import { readFileSync } from 'node:fs'
       import { marker } from 'reads-at-build'
       export default { plugins: { bad: { load() { return readFileSync(marker) } } } }`,
      'also-project'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(() => config.plugins.bad.load()).toThrow(
      /"reads-at-build" package, which commoners\.config imports, or by the config itself\./
    )
  })

  test('a project opened through a symlinked folder names no package', async () => {
    const real = join(dir, 'real-app')
    mkdirSync(real, { recursive: true })
    writeFileSync(join(real, 'package.json'), JSON.stringify({ name: 'my-app', type: 'module' }))
    writeFileSync(join(real, 'local.js'), packageSource(CALL_AT_LOAD))
    writeFileSync(join(real, 'commoners.config.js'), configUsing('./local.js'))
    const link = join(dir, 'link-app')
    symlinkSync(real, link, 'dir')
    const outFile = join(dir, 'out', 'symlinked', 'config.mjs')
    await bundleConfig(join(link, 'commoners.config.js'), outFile, { target: 'web' })
    expect(await loadFailure(outFile)).toBe(PROJECT_MESSAGE)
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
    const { outFile, files } = await bundleInto(lazyConfig(), 'lazy-page')
    expect(Object.keys(files)).toEqual(['config.mjs']) // No separate chunk for the package either
    const code = files['config.mjs']
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
    const outFile = join(dir, 'out', 'lazy-node', 'config.cjs')
    await bundleConfig(input, outFile, { node: true, desktop: true, target: 'electron' })
    const loaded = createRequire(import.meta.url)(outFile)
    const config = loaded.default ?? loaded
    expect(config.vite).toBeUndefined()
    expect(await config.plugins.greet.start()).toBe(MARKER)
  })
})

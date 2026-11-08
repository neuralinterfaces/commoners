import { afterAll, describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseAst } from 'vite'

import { bundleConfig } from '../packages/core/utils/assets'
import { nodeOnlyDepsPlugin } from '../packages/core/utils/node-only-deps'

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

// Leaving a dependency out must never drop code a working page needs. Only the entry module of
// a package the config imports by name is a candidate, and only when nothing imports it just for
// its load-time effect and its package says nothing about side effects or browser builds.
describe('Browser config bundle: Node-only dependencies are only left out when safe', () => {
  const pkgFiles = (name: string, files: Record<string, string | object>) => {
    for (const [file, contents] of Object.entries(files)) {
      const path = join(dir, 'node_modules', name, file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents))
    }
  }
  const esm = (name: string, extra: Record<string, unknown> = {}) => ({
    name,
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    ...extra,
  })

  test('setup code a used package imports for its effect is kept', async () => {
    pkgFiles('internal-setup', {
      'package.json': esm('internal-setup'),
      'index.js': `import './setup.js'\nexport const x = () => globalThis.__internalSetupMark`,
      'setup.js': `import { EventEmitter } from 'events'\nglobalThis.__internalSetupMark = 'SETUP_MARK:' + typeof EventEmitter`,
    })
    const { outFile } = await bundleForBrowser(
      `import { x } from 'internal-setup'
       export default { plugins: { setup: { load() { return x() } } } }`,
      'internal-setup'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.setup.load()).toBe('SETUP_MARK:function')
  })

  test('setup code is kept when the used entry itself imports a Node built-in', async () => {
    pkgFiles('internal-setup-node-entry', {
      'package.json': esm('internal-setup-node-entry'),
      'index.js': `import { readFileSync } from 'node:fs'\nimport './setup.js'\nexport const x = () => globalThis.__internalSetupEntryMark\nexport const read = p => readFileSync(p)`,
      'setup.js': `import { EventEmitter } from 'events'\nglobalThis.__internalSetupEntryMark = 'SETUP_ENTRY_MARK:' + typeof EventEmitter`,
    })
    const { outFile } = await bundleForBrowser(
      `import { x } from 'internal-setup-node-entry'
       export default { plugins: { setup: { load() { return x() } } } }`,
      'internal-setup-node-entry'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.setup.load()).toBe('SETUP_ENTRY_MARK:function')
  })

  test('sideEffects declared at the package root is honoured for a nested build folder', async () => {
    pkgFiles('nested-decl', {
      'package.json': {
        name: 'nested-decl',
        version: '1.0.0',
        sideEffects: true,
        main: 'esm/index.js',
      },
      'esm/package.json': { type: 'module' },
      'esm/index.js': `import { readFileSync } from 'node:fs'\nglobalThis.__nestedDecl = 'NESTED_DECL_MARK'\nexport const read = p => readFileSync(p)`,
    })
    const { code } = await bundleForBrowser(
      `import { read } from 'nested-decl'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read('x') } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'nested-decl'
    )
    expect(code).toContain('NESTED_DECL_MARK')
  })

  test('a package with a browser field imported for its load-time effect is kept', async () => {
    pkgFiles('browser-field-effect', {
      'package.json': esm('browser-field-effect', { browser: { fs: false } }),
      'index.js': `import fs from 'fs'\nglobalThis.__browserFieldEffect = 'BROWSER_FIELD_MARK:' + typeof fs\nexport const read = p => fs.readFileSync(p)`,
    })
    const { outFile, code } = await bundleForBrowser(
      `import 'browser-field-effect'
       export default { plugins: { greet: { load() { return globalThis.__browserFieldEffect } } } }`,
      'browser-field-effect'
    )
    expect(code).toContain('BROWSER_FIELD_MARK')
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toMatch(/^BROWSER_FIELD_MARK:/)
  })

  test('a package with a browser field is kept even when only build settings use it', async () => {
    pkgFiles('browser-field-build-only', {
      'package.json': esm('browser-field-build-only', { browser: { fs: false } }),
      'index.js': `import fs from 'fs'\nglobalThis.__browserFieldBuildOnly = 'BROWSER_FIELD_BUILD_ONLY_MARK'\nexport const read = p => fs.readFileSync(p)`,
    })
    const { code } = await bundleForBrowser(
      `import { read } from 'browser-field-build-only'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read('x') } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'browser-field-build-only'
    )
    expect(code).toContain('BROWSER_FIELD_BUILD_ONLY_MARK')
  })

  test('a package with a browser export condition is kept even when only build settings use it', async () => {
    pkgFiles('browser-condition', {
      'package.json': esm('browser-condition', {
        exports: { '.': { browser: './browser.js', default: './index.js' } },
      }),
      'index.js': `export const read = () => 'node build'`,
      'browser.js': `import { EventEmitter } from 'events'\nglobalThis.__browserCondition = 'BROWSER_CONDITION_MARK:' + typeof EventEmitter\nexport const read = () => 'browser build'`,
    })
    const { code } = await bundleForBrowser(
      `import { read } from 'browser-condition'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read() } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'browser-condition'
    )
    expect(code).toContain('BROWSER_CONDITION_MARK')
  })

  test('a Node-only package that is also imported for its effect is kept', async () => {
    pkgFiles('node-only-also-effect', {
      'package.json': esm('node-only-also-effect'),
      'index.js': `import { readFileSync } from 'node:fs'\nglobalThis.__nodeOnlyAlsoEffect = 'ALSO_EFFECT_MARK'\nexport const read = p => readFileSync(p)`,
    })
    write('also-effect-local.js', `import 'node-only-also-effect'\nexport const local = 1`)
    const { code } = await bundleForBrowser(
      `import { read } from 'node-only-also-effect'
       import { local } from './also-effect-local.js'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read('x') } }] },
         plugins: { greet: { load() { return local } } },
       }`,
      'node-only-also-effect'
    )
    expect(code).toContain('ALSO_EFFECT_MARK')
  })

  test('a TypeScript config that uses a Node-only package only in build settings leaves it out', async () => {
    pkgFiles('node-only-ts', {
      'package.json': esm('node-only-ts'),
      'index.js': `import { readFileSync } from 'node:fs'\nglobalThis.__nodeOnlyTs = readFileSync('/etc/hosts', 'utf8').length\nexport const read = (p) => 'NODE_ONLY_TS_MARKER' + readFileSync(p)`,
    })
    const input = write(
      'node-only-ts.config.ts',
      `import { read } from 'node-only-ts'
       const files: string[] = ['x']
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved(): void { files.forEach(f => read(f)) } }] },
         plugins: { greet: { load: (): string => 'hello' } },
       }`
    )
    const outFile = join(dir, 'node-only-ts.out.mjs')
    await bundleConfig(input, outFile, { target: 'web' })
    const code = readFileSync(outFile, 'utf8')
    expect(code).not.toContain('NODE_ONLY_TS_MARKER')
    expect(code).not.toContain('__nodeOnlyTs')
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe('hello')
  })

  test('a browser package imported by name keeps its load-time code even if only build settings use it', async () => {
    pkgFiles('browser-by-name', {
      'package.json': esm('browser-by-name'),
      'index.js': `globalThis.__browserByName = 'BROWSER_BY_NAME_MARK'\nexport const tag = 'x-el'`,
    })
    const { code } = await bundleForBrowser(
      `import { tag } from 'browser-by-name'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { return tag } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'browser-by-name'
    )
    expect(code).toContain('BROWSER_BY_NAME_MARK')
  })

  test('a Node-only package that another package imports is kept for that package', async () => {
    pkgFiles('inner-node', {
      'package.json': esm('inner-node'),
      'index.js': `import { EventEmitter } from 'events'\nglobalThis.__innerNode = 'INNER_NODE_MARK:' + typeof EventEmitter\nexport const helper = () => new EventEmitter()`,
    })
    pkgFiles('outer-wrapper', {
      'package.json': esm('outer-wrapper'),
      'index.js': `import { helper } from 'inner-node'\nexport const value = () => globalThis.__innerNode\nexport const build = () => helper()`,
    })
    const { outFile } = await bundleForBrowser(
      `import { value } from 'outer-wrapper'
       export default { plugins: { greet: { load() { return value() } } } }`,
      'outer-wrapper'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(config.plugins.greet.load()).toBe('INNER_NODE_MARK:function')
  })

  test('a file inside node_modules imported by relative path is left as it is', async () => {
    pkgFiles('node-only-relative', {
      'package.json': esm('node-only-relative'),
      'index.js': `import { readFileSync } from 'node:fs'\nglobalThis.__nodeOnlyRelative = 'RELATIVE_MARK'\nexport const read = p => readFileSync(p)`,
    })
    const { code } = await bundleForBrowser(
      `import { read } from './node_modules/node-only-relative/index.js'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read('x') } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'node-only-relative'
    )
    expect(code).toContain('RELATIVE_MARK')
  })

  test('a Node-only package the page loads with import() is kept whole', async () => {
    pkgFiles('node-only-dynamic', {
      'package.json': esm('node-only-dynamic'),
      'index.js': `import { readFileSync } from 'node:fs'\nglobalThis.__nodeOnlyDynamic = 'DYNAMIC_MARK'\nexport const marker = 'DYNAMIC_EXPORT'\nexport const read = p => readFileSync(p)`,
    })
    const { outFile } = await bundleForBrowser(
      `import { read } from 'node-only-dynamic'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read('x') } }] },
         plugins: { lazy: { load() { return import('node-only-dynamic').then(m => m.marker + ':' + globalThis.__nodeOnlyDynamic) } } },
       }`,
      'node-only-dynamic'
    )
    const config = (await import(pathToFileURL(outFile).href)).default
    expect(await config.plugins.lazy.load()).toBe('DYNAMIC_EXPORT:DYNAMIC_MARK')
  })

  test('a CommonJS Node-only package is left as it is', async () => {
    pkgFiles('node-only-cjs', {
      'package.json': { name: 'node-only-cjs', version: '1.0.0', main: 'index.js' },
      'index.js': `const fs = require('fs')\nglobalThis.__nodeOnlyCjs = 'NODE_ONLY_CJS_MARK'\nexports.read = p => fs.readFileSync(p)`,
    })
    const { code } = await bundleForBrowser(
      `import { read } from 'node-only-cjs'
       export default {
         vite: { plugins: [{ name: 'build-only', configResolved() { read('x') } }] },
         plugins: { greet: { load() { return 'hello' } } },
       }`,
      'node-only-cjs'
    )
    expect(code).toContain('NODE_ONLY_CJS_MARK')
  })
})

// The rule's guards in isolation, in orders a real build can produce but does not always produce
describe('Node-only dependency rule: ordering and fail-safes', () => {
  const root = join(dir, 'unit')
  const depFile = join(root, 'node_modules', 'unit-dep', 'index.js').replace(/\\/g, '/')
  mkdirSync(dirname(depFile), { recursive: true })
  writeFileSync(
    join(dirname(depFile), 'package.json'),
    JSON.stringify({ name: 'unit-dep', type: 'module' })
  )
  writeFileSync(depFile, '')
  const userFile = join(root, 'config.js').replace(/\\/g, '/')
  const otherFile = join(root, 'other.js').replace(/\\/g, '/')

  const setup = () => {
    const leftOut: string[][] = []
    const plugin = nodeOnlyDepsPlugin({ onLeftOut: names => leftOut.push(names) })
    const infos = new Map<string, { moduleSideEffects: unknown }>()
    const info = (id: string) => {
      if (!infos.has(id)) infos.set(id, { moduleSideEffects: true })
      return infos.get(id)!
    }
    const ctx = {
      parse: (code: string) => parseAst(code),
      resolve: async (source: string) => ({ id: source === 'unit-dep' ? depFile : source }),
      getModuleInfo: info,
    }
    const transform = (code: string, id: string) => plugin.transform.call(ctx, code, id)
    const dep = () =>
      transform(`import { readFileSync } from 'node:fs'\nexport const r = readFileSync`, depFile)
    const user = () => transform(`import { r } from 'unit-dep'\nexport default {}`, userFile)
    const finish = (rendered: string[]) =>
      plugin.generateBundle(
        {},
        { 'out.mjs': { type: 'chunk', modules: Object.fromEntries(rendered.map(id => [id, {}])) } }
      )
    return { info, transform, dep, user, finish, leftOut }
  }

  test('marked whether the importer or the dependency is read first', async () => {
    const a = setup()
    await a.user()
    await a.dep()
    expect(a.info(depFile).moduleSideEffects).toBe(false)

    const b = setup()
    await b.dep()
    expect(b.info(depFile).moduleSideEffects).toBe(true)
    await b.user()
    expect(b.info(depFile).moduleSideEffects).toBe(false)
  })

  test('an effect import seen between the dependency and its importer prevents marking', async () => {
    const t = setup()
    await t.dep()
    await t.transform(`import 'unit-dep'`, otherFile)
    await t.user()
    expect(t.info(depFile).moduleSideEffects).toBe(true)
  })

  test('an effect import seen after marking restores the side effects', async () => {
    const t = setup()
    await t.user()
    await t.dep()
    await t.transform(`import 'unit-dep'`, otherFile)
    expect(t.info(depFile).moduleSideEffects).toBe(true)
    t.finish([])
    expect(t.leftOut).toEqual([])
  })

  test('a module the rule cannot read turns it off and restores marked modules', async () => {
    const t = setup()
    await t.user()
    await t.dep()
    await t.transform(`this is not javascript (`, otherFile)
    expect(t.info(depFile).moduleSideEffects).toBe(true)
  })

  test('a package left out of the bundle is named; one that is kept is not', async () => {
    const out = setup()
    await out.user()
    await out.dep()
    out.finish([userFile])
    expect(out.leftOut).toEqual([['unit-dep']])

    const kept = setup()
    await kept.user()
    await kept.dep()
    kept.finish([userFile, depFile])
    expect(kept.leftOut).toEqual([])
  })

  test('bundleConfig warns with the name of each package it leaves out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await bundleForBrowser(
        `import { readMarker } from 'node-only-on-load'
         export default {
           vite: { plugins: [{ name: 'build-only', configResolved() { readMarker('x') } }] },
           plugins: { greet: { load() { return 'hello' } } },
         }`,
        'node-only-warning'
      )
      const messages = warn.mock.calls.map(call => String(call[0]))
      expect(
        messages.some(
          m => m.includes('Left out of the page config bundle') && m.includes('node-only-on-load')
        )
      ).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})

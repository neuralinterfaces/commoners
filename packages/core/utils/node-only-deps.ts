// The page bundle of commoners.config keeps only the properties the page uses, and exports that
// only build settings use tree-shake away. A package's top-level code is kept anyway unless the
// package says it has no side effects, so a package written for Node (one that reads a file or
// starts something when it is imported) still runs in the page when the config uses it only in
// build settings. There it calls the Node built-in stub and the app fails to load.
//
// Leaving code out must never drop something a working page needs, so the rule is narrow. A
// module is treated as side-effect free in the page bundle only when ALL of these hold:
//   - it is the module a bare import in the user's own config code resolves to (a package
//     entry), imported by name (`import { x } from 'pkg'`), not for its effect (`import 'pkg'`);
//   - no module anywhere in the bundle imports it for its effect;
//   - it statically imports a Node built-in that the page bundle stubs (so it is an ES module:
//     CommonJS packages are left alone);
//   - no package.json from its folder up to the package root declares `sideEffects`, a
//     `browser` field or a `browser` export condition (the package has said how it behaves in
//     a browser, so its own statement applies).
// Rollup then leaves it out when the page uses none of its exports, and keeps it, load-time code
// and imports included, when the page uses any export. Other modules of the package, such as
// setup files it imports for their effect, are never marked themselves. Anything that cannot be
// read turns the rule off for the whole bundle, and every package left out is named in a warning.

import { builtinModules } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

// Built-ins that have a browser alias in the page bundle; everything else resolves to the stub
export const BROWSER_ALIASED_BUILTINS = new Set(['path', 'url', 'process'])

export const isStubbedBuiltin = (id: string) => {
  const bare = id.startsWith('node:') ? id.slice(5) : id
  return !BROWSER_ALIASED_BUILTINS.has(bare) && builtinModules.includes(bare)
}

type AstNode = { type: string; [key: string]: any }

type ModuleImport = { source: string; effectOnly: boolean }

// Static imports and re-exports of a module. A literal `import()` needs no entry here: Rollup
// keeps the whole namespace of a dynamically imported module (see the dynamic import test).
export const collectImports = (ast: { body: AstNode[] }): ModuleImport[] => {
  const found: ModuleImport[] = []
  for (const statement of ast.body) {
    const source = statement.source?.value
    if (statement.type === 'ImportDeclaration' && typeof source === 'string')
      found.push({ source, effectOnly: statement.specifiers.length === 0 })
    else if (
      (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') &&
      typeof source === 'string'
    )
      found.push({ source, effectOnly: false })
  }
  return found
}

const isBareSpecifier = (source: string) =>
  !source.startsWith('.') &&
  !source.startsWith('/') &&
  !source.startsWith('\0') &&
  !/^[a-z]+:/i.test(source)

// True when any package.json from the file's folder up to the package root (the first one with a
// `name`) says how the package behaves: `sideEffects`, a `browser` field or a `browser` export
// condition. A file with no package root inside node_modules counts as declared (left alone).
const packageDeclaresBehaviour = (() => {
  const cache = new Map<string, boolean>()
  return (file: string): boolean => {
    const visited: string[] = []
    let directory = dirname(file)
    let result: boolean | undefined
    for (;;) {
      const cached = cache.get(directory)
      if (cached !== undefined) {
        result = cached
        break
      }
      visited.push(directory)
      if (basename(directory) === 'node_modules' || dirname(directory) === directory) {
        result = true
        break
      }
      const manifestPath = join(directory, 'package.json')
      if (existsSync(manifestPath)) {
        let manifest: Record<string, unknown>
        try {
          manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        } catch {
          result = true // Unreadable manifest: leave the module as it is
          break
        }
        if (
          'sideEffects' in manifest ||
          'browser' in manifest ||
          JSON.stringify(manifest.exports ?? null).includes('"browser"')
        ) {
          result = true
          break
        }
        if (typeof manifest.name === 'string') {
          result = false
          break
        }
      }
      directory = dirname(directory)
    }
    for (const visitedDirectory of visited) cache.set(visitedDirectory, result)
    return result
  }
})()

const packageName = (file: string) => {
  const after = file.slice(file.lastIndexOf('/node_modules/') + '/node_modules/'.length)
  const parts = after.split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

const fileOf = (id: string) => id.split('?')[0].replace(/\\/g, '/')

type PluginContext = {
  parse: (code: string) => any
  resolve: (source: string, importer: string) => Promise<{ id: string; external?: unknown } | null>
  getModuleInfo: (id: string) => { moduleSideEffects: unknown } | null
}

export const nodeOnlyDepsPlugin = ({
  onLeftOut = (packages: string[]) =>
    console.warn(
      `[commoners] Left out of the page config bundle (Node-only, used only by build settings): ${packages.join(', ')}. ` +
        `To keep one in the page, use it from a page plugin or import it for its effect (import '<name>').`
    ),
}: { onLeftOut?: (packages: string[]) => void } = {}) => {
  const importedByName = new Set<string>() // Package entries the user's own code imports by name
  const importedForEffect = new Set<string>() // Modules any code imports for their effect
  const eligible = new Map<string, string>() // Module id → file, for entries that may be marked
  const marked = new Map<string, string>() // Module id → file, for modules marked side-effect free
  let disabled = false

  // Modules are transformed in no fixed order (a dependency can be read before its importer
  // finishes), so whichever side arrives second marks the module, on Rollup's live module info
  const markIfReady = (ctx: PluginContext, id: string) => {
    const file = eligible.get(id)
    if (disabled || !file || marked.has(id) || !importedByName.has(id) || importedForEffect.has(id))
      return
    const info = ctx.getModuleInfo(id)
    if (!info) return
    info.moduleSideEffects = false
    marked.set(id, file)
  }

  const unmark = (ctx: PluginContext, id: string) => {
    const info = ctx.getModuleInfo(id)
    if (info) info.moduleSideEffects = true
    marked.delete(id)
    eligible.delete(id)
  }

  const disable = (ctx: PluginContext) => {
    disabled = true
    for (const id of [...marked.keys()]) unmark(ctx, id)
  }

  return {
    name: 'commoners-node-only-deps',
    // After TypeScript and other syntax are compiled away, so every module parses as JavaScript
    enforce: 'post' as const,
    async transform(this: PluginContext, code: string, id: string) {
      if (disabled) return null
      const file = fileOf(id)
      const isVirtual = id.startsWith('\0')
      const inDependency = !isVirtual && file.includes('/node_modules/')

      let imports: ModuleImport[]
      try {
        imports = collectImports(this.parse(code))
      } catch {
        disable(this) // A module this rule cannot read might import anything for its effect
        return null
      }

      for (const { source, effectOnly } of imports) {
        const resolved = await this.resolve(source, id).catch(() => null)
        if (!resolved || resolved.external) continue
        if (effectOnly) {
          importedForEffect.add(resolved.id)
          if (marked.has(resolved.id)) unmark(this, resolved.id)
        } else if (!isVirtual && !inDependency && isBareSpecifier(source)) {
          importedByName.add(resolved.id)
          markIfReady(this, resolved.id)
        }
      }

      // CommonJS needs no check of its own: the commonjs plugin serves a CommonJS package under
      // virtual ids, so a named import never resolves to its file, and its built-in requires
      // arrive as virtual proxies, not built-in imports (see the CommonJS test)
      if (
        !inDependency ||
        !imports.some(({ source }) => isStubbedBuiltin(source)) ||
        packageDeclaresBehaviour(file)
      )
        return null

      eligible.set(id, file)
      // The module info exists once transform starts; mark now if the import was already seen
      markIfReady(this, id)
      return null
    },
    generateBundle(_: unknown, bundle: Record<string, { type: string; modules?: object }>) {
      const rendered = new Set<string>()
      for (const output of Object.values(bundle))
        if (output.type === 'chunk' && output.modules)
          Object.keys(output.modules).forEach(id => rendered.add(id))
      const leftOut = new Set<string>()
      for (const [id, file] of marked) if (!rendered.has(id)) leftOut.add(packageName(file))
      if (leftOut.size) onLeftOut([...leftOut].sort())
    },
  }
}

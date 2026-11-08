// The page bundle of commoners.config keeps only the properties the page uses, and exports that
// only build settings use tree-shake away. A package's top-level code is kept anyway unless the
// package says it has no side effects, so a package written for Node (one that reads a file or
// starts something when it is imported) still runs in the page when the config uses it only in
// build settings. There it calls the Node built-in stub and the app fails to load.
//
// A module in node_modules that still imports a Node built-in the page cannot provide (one that
// resolves to the stub) is code for Node, so it is treated as side-effect free in the page
// bundle: it is left out when the page uses none of its exports, and kept, load-time code and
// all, when it does. Browser packages are untouched, so side-effect imports such as polyfills
// and element registrations still run. A package that declares `sideEffects` in its
// package.json keeps its own declaration.

import { builtinModules } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Built-ins that have a browser alias in the page bundle; everything else resolves to the stub
export const BROWSER_ALIASED_BUILTINS = new Set(['path', 'url', 'process'])

export const isStubbedBuiltin = (id: string) => {
  const bare = id.startsWith('node:') ? id.slice(5) : id
  return !BROWSER_ALIASED_BUILTINS.has(bare) && builtinModules.includes(bare)
}

type Node = { type: string; source?: { value?: unknown } | null }

// Static import / re-export sources of an ES module
export const importsStubbedBuiltin = (ast: { body: Node[] }) =>
  ast.body.some(
    statement =>
      (statement.type === 'ImportDeclaration' ||
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportAllDeclaration') &&
      typeof statement.source?.value === 'string' &&
      isStubbedBuiltin(statement.source.value)
  )

const declaresSideEffects = (() => {
  const cache = new Map<string, boolean>()
  const lookup = (directory: string): boolean => {
    const cached = cache.get(directory)
    if (cached !== undefined) return cached
    const manifest = join(directory, 'package.json')
    let result: boolean
    if (existsSync(manifest)) {
      try {
        result = 'sideEffects' in JSON.parse(readFileSync(manifest, 'utf8'))
      } catch {
        result = true // Unreadable manifest: leave the module as it is
      }
    } else {
      const parent = dirname(directory)
      result = parent === directory ? true : lookup(parent)
    }
    cache.set(directory, result)
    return result
  }
  return (file: string) => lookup(dirname(file))
})()

export const nodeOnlyDepsPlugin = () => ({
  name: 'commoners-node-only-deps',
  enforce: 'post' as const,
  transform(this: { parse: (code: string) => any }, code: string, id: string) {
    const file = id.split('?')[0].replace(/\\/g, '/')
    if (id.startsWith('\0') || !file.includes('/node_modules/')) return null
    if (!/\.(m|c)?jsx?$/.test(file)) return null
    let ast
    try {
      ast = this.parse(code)
    } catch {
      return null // Not plain JavaScript at this point; leave it to the bundler
    }
    if (!importsStubbedBuiltin(ast) || declaresSideEffects(file)) return null
    return { code, map: null, moduleSideEffects: false }
  },
})

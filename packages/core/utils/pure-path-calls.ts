// The page bundle of commoners.config keeps only `plugins`, but module-level code still runs
// through the bundler. A top-level `join(dirname(fileURLToPath(import.meta.url)), 'x')` used
// only by build settings is kept anyway, because the browser path polyfill can throw and so
// looks side-effectful. That carries build-time values, including the developer's absolute
// project path, into the page.
//
// path and url helpers compute values and do nothing else, so calls to them in the user's own
// config code are marked pure: unused results tree-shake away, used ones are kept unchanged.

const PURE_MODULES = new Set([
  'path',
  'node:path',
  'path/posix',
  'node:path/posix',
  'url',
  'node:url',
])

type Node = { type: string; start: number; end: number; [key: string]: any }

const walk = (node: any, visit: (node: Node) => void) => {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const key in node) {
    const value = node[key]
    if (Array.isArray(value)) value.forEach(child => walk(child, visit))
    else if (value && typeof value.type === 'string') walk(value, visit)
  }
}

export const markPurePathCalls = (code: string, parse: (code: string) => any): string | null => {
  const functions = new Set<string>() // import { join } from 'node:path'
  const namespaces = new Set<string>() // import path from 'node:path' / import * as path

  const ast = parse(code)
  for (const statement of ast.body) {
    if (statement.type !== 'ImportDeclaration' || !PURE_MODULES.has(statement.source.value))
      continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier') functions.add(specifier.local.name)
      else namespaces.add(specifier.local.name)
    }
  }
  if (!functions.size && !namespaces.size) return null

  const starts: number[] = []
  walk(ast, node => {
    if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return
    const { callee } = node
    const isPure =
      (callee.type === 'Identifier' && functions.has(callee.name)) ||
      (callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        namespaces.has(callee.object.name))
    if (isPure) starts.push(node.start)
  })
  if (!starts.length) return null

  let out = code
  for (const start of starts.sort((a, b) => b - a))
    out = out.slice(0, start) + '/*#__PURE__*/ ' + out.slice(start)
  return out
}

export const purePathCallsPlugin = () => ({
  name: 'commoners-pure-path-calls',
  enforce: 'post' as const, // After TypeScript is stripped, so the code parses as JavaScript
  transform(this: { parse: (code: string) => any }, code: string, id: string) {
    if (id.startsWith('\0') || id.includes('/node_modules/')) return null // The user's own code only
    if (!/\.(m|c)?(j|t)sx?$/.test(id.split('?')[0])) return null
    const marked = markPurePathCalls(code, source => this.parse(source))
    return marked === null ? null : { code: marked, map: null }
  },
})

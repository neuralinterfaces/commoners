import { describe, test, expect } from 'vitest'

import { findEvalUses } from '../packages/core/vite/plugins/no-eval'

// The CSP on every target omits 'unsafe-eval', so these calls throw at runtime
describe('findEvalUses', () => {
  test.each([
    ['direct eval', 'const x = eval("1 + 1")'],
    ['indirect eval (minified)', 'var r=(0,eval)(s)'],
    ['global eval', 'window.eval(code)'],
    ['new Function', 'const f = new Function("a", "return a")'],
    ['Function call', 'var g=Function("return this")()'],
    ['string setTimeout', 'setTimeout("tick()", 10)'],
  ])('catches %s', (_, code) => {
    expect(findEvalUses(code).length).toBeGreaterThan(0)
  })

  test.each([
    ['identifiers that merely contain the words', 'isFunction(x); evaluate(y); retrieval(z)'],
    ['typeof checks', 'typeof x === "function"'],
    ['function setTimeout', 'setTimeout(() => tick(), 10)'],
    ['a property named eval', 'const config = { evalMode: 1 }'],
  ])('ignores %s', (_, code) => {
    expect(findEvalUses(code)).toEqual([])
  })

  test('reports where each use is, with a short excerpt', () => {
    const [use] = findEvalUses('a();b();eval("x");c()')
    expect(use.index).toBe(8)
    expect(use.excerpt).toContain('eval("x")')
  })
})

import { describe, test, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Node's ES modules have no `require`. A bare require() in core's ESM build throws (or, inside a
// try/catch, silently takes the fallback path) for every consumer that imports the package as ESM.
// Use createRequire(import.meta.url) or a static import instead.
const dist = join(__dirname, '..', 'packages', 'core', 'dist')

// require() inside a code string generated for another process is not executed here
const ALLOWED = [/module\.exports = require\(path\)/]

describe('core ESM build', () => {
  test.skipIf(!existsSync(dist))('contains no bare require() calls', () => {
    const offenders: string[] = []
    for (const file of readdirSync(dist).filter(f => /\.(m?js)$/.test(f))) {
      const code = readFileSync(join(dist, file), 'utf8')
      for (const match of code.matchAll(/(?<![\w.$])require\(/g)) {
        const context = code.slice(Math.max(0, match.index! - 40), match.index! + 40)
        if (!ALLOWED.some(pattern => pattern.test(context))) offenders.push(`${file}: …${context}…`)
      }
    }
    expect(offenders).toEqual([])
  })
})

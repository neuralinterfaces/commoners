/**
 * Build-time scan for code the shared CSP will block at runtime (no target allows
 * 'unsafe-eval'): eval, Function constructors and string-based timers.
 *
 * Default 'warn': unreachable fallbacks in dependencies are common and harmless, so a
 * working app must not fail to build. 'error' makes any hit fail the build.
 */

import type { Plugin } from 'vite'
import { addEvalFinding } from '../../utils/build-record.js'

export type NoEvalMode = 'error' | 'warn' | false

const PATTERNS: Array<[string, RegExp]> = [
  ['eval', /(?<![\w$.])eval\s*\(/g],
  ['indirect eval', /\(\s*0\s*,\s*eval\s*\)\s*\(/g],
  ['global eval', /\b(?:window|self|globalThis)\.eval\s*\(/g],
  ['Function constructor', /(?<![\w$.])(?:new\s+)?Function\s*\(/g],
  ['string timer', /\b(?:setTimeout|setInterval)\s*\(\s*["'`]/g],
]

export type EvalUse = { pattern: string; index: number; excerpt: string }

export const findEvalUses = (code: string): EvalUse[] => {
  const uses: EvalUse[] = []
  for (const [pattern, regex] of PATTERNS) {
    for (const match of code.matchAll(regex)) {
      const index = match.index!
      uses.push({
        pattern,
        index,
        excerpt: code.slice(Math.max(0, index - 30), index + 40).replace(/\s+/g, ' '),
      })
    }
  }
  // An indirect eval also matches the plain pattern; keep one report per position
  return uses
    .sort((a, b) => a.index - b.index)
    .filter((use, i, all) => i === 0 || use.index - all[i - 1].index > 8)
}

// root: also report each hit to the build record's SARIF file for that project
export default function noEvalPlugin(mode: NoEvalMode = 'warn', root?: string): Plugin | null {
  if (!mode) return null
  return {
    name: 'commoners:no-eval',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const hits: string[] = []
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const use of findEvalUses(chunk.code)) {
          hits.push(`  ${fileName}: ${use.pattern} … ${use.excerpt}`)
          if (root)
            addEvalFinding(root, {
              ruleId: 'no-eval',
              level: mode === 'error' ? 'error' : 'warning',
              message: `${use.pattern}: ${use.excerpt}`,
              file: fileName,
            })
        }
      }
      if (!hits.length) return
      const message =
        `${hits.length} use(s) of eval-like code, which the Content Security Policy blocks at runtime:\n` +
        hits.slice(0, 20).join('\n') +
        (hits.length > 20 ? `\n  …and ${hits.length - 20} more` : '') +
        `\nSet security.noEval to 'error' to fail builds on this, or false to silence it.`
      if (mode === 'error') this.error(message)
      else this.warn(message)
    },
  }
}

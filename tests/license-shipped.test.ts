import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { classifyLicenses, isCopyleftOnly } from '../scripts/license-shipped.mjs'

// The licence check fails CI when a published package depends on code licensed only under
// GPL or AGPL. A dual licence with a permissive choice passes.

const script = join(__dirname, '..', 'scripts', 'license-shipped.mjs')
const mod = (name: string) => ({ name, versions: ['1.0.0'] })

const run = (report: unknown) => {
  const file = join(mkdtempSync(join(tmpdir(), 'license-shipped-')), 'report.json')
  writeFileSync(file, JSON.stringify(report))
  return spawnSync(process.execPath, [script, file], { encoding: 'utf8' })
}

describe('isCopyleftOnly', () => {
  test.each(['GPL-2.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-3.0', '(MIT AND GPL-3.0)'])(
    '%s is copyleft only',
    license => expect(isCopyleftOnly(license)).toBe(true)
  )

  test.each(['MIT', '(MIT OR GPL-3.0-or-later)', 'LGPL-3.0', 'Apache-2.0', 'Unknown'])(
    '%s is not',
    license => expect(isCopyleftOnly(license)).toBe(false)
  )
})

describe('classifyLicenses', () => {
  test('reports copyleft and unknown licences separately', () => {
    const { failures, unknown } = classifyLicenses({
      MIT: [mod('a')],
      'GPL-3.0-only': [mod('bad')],
      Unknown: [mod('who')],
    })
    expect(failures.map(f => f.names)).toEqual([['bad@1.0.0']])
    expect(unknown.map(u => u.names)).toEqual([['who@1.0.0']])
  })

  test('refuses a value that is not a report', () => {
    expect(() => classifyLicenses([])).toThrow(/Not a pnpm licenses report/)
    expect(() => classifyLicenses(null)).toThrow(/Not a pnpm licenses report/)
  })
})

describe('license-shipped script', () => {
  test('exits 1 on a copyleft-only dependency', () => {
    const result = run({ MIT: [mod('a')], 'AGPL-3.0': [mod('bad')] })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::')
  })

  test('exits 0 when every licence offers a permissive choice', () => {
    const result = run({ MIT: [mod('a')], '(MIT OR GPL-3.0-or-later)': [mod('jszip')] })
    expect(result.status).toBe(0)
  })
})

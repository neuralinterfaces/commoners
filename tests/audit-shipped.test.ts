import { describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { classifyAudit } from '../scripts/audit-shipped.mjs'

// The audit fails CI only for what users install: advisories reached from a published package.
// Docs, examples and repository tooling still show up, as warnings.

const advisory = (id: string, severity: string, paths: string[]) => ({
  github_advisory_id: id,
  module_name: `mod-${id}`,
  severity,
  patched_versions: '>=9.9.9',
  title: `title ${id}`,
  findings: [{ version: '1.0.0', paths }],
})

const metadata = { vulnerabilities: {} }

const report = {
  metadata,
  advisories: {
    1: advisory('SHIPPED-HIGH', 'high', ['packages__core>@electron-toolkit/utils>electron']),
    2: advisory('PLUGIN-CRITICAL', 'critical', ['packages__plugins__windows>dep']),
    3: advisory('DOCS-CRITICAL', 'critical', ['.>mermaid>dompurify']),
    4: advisory('EXAMPLE-HIGH', 'high', [
      'examples__demo__src__services__express>express>body-parser',
    ]),
    5: advisory('SHIPPED-MODERATE', 'moderate', ['packages__testing>webdriverio>undici']),
    6: advisory('BOTH-HIGH', 'high', ['.>x>y', 'packages__cli>x>y']),
    7: advisory('LINKED-HIGH', 'high', [
      'examples/port-channels > @commoners/solidarity@link:../../packages/core > @electron-toolkit/utils@4.0.0 > electron@41.10.7',
    ]),
    8: advisory('EXAMPLE-SPACED-HIGH', 'high', [
      'examples/demo/src/services/express > express@4.21.2 > body-parser@1.20.3',
    ]),
  },
}

describe('audit split by what ships', () => {
  test('fails only on high or critical advisories reached from a published package', () => {
    const { failures } = classifyAudit(report)
    expect(failures.map(a => a.id).sort()).toEqual([
      'BOTH-HIGH',
      'LINKED-HIGH',
      'PLUGIN-CRITICAL',
      'SHIPPED-HIGH',
    ])
  })

  test('docs, examples and tooling advisories are kept as warnings, not dropped', () => {
    const { unshipped } = classifyAudit(report)
    expect(unshipped.map(a => a.id).sort()).toEqual([
      'DOCS-CRITICAL',
      'EXAMPLE-HIGH',
      'EXAMPLE-SPACED-HIGH',
    ])
  })

  test('an error or empty report is refused, not read as a clean audit', () => {
    expect(() => classifyAudit({})).toThrow(/Not a pnpm audit report/)
    expect(() => classifyAudit({ error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } })).toThrow()
  })

  test('the script exits 1 on a shipped high and 0 when only unshipped ones remain', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-shipped-'))
    const run = (data: object) => {
      const file = join(dir, `${Math.random()}.json`)
      writeFileSync(file, JSON.stringify(data))
      return spawnSync(
        process.execPath,
        [join(__dirname, '..', 'scripts', 'audit-shipped.mjs'), file],
        {
          encoding: 'utf8',
        }
      )
    }

    const failing = run(report)
    expect(failing.status).toBe(1)
    expect(failing.stdout).toContain('::error::high mod-SHIPPED-HIGH')
    expect(failing.stdout).toContain('::warning::critical mod-DOCS-CRITICAL')

    const passing = run({
      metadata,
      advisories: { 3: report.advisories[3], 4: report.advisories[4] },
    })
    expect(passing.status, passing.stdout).toBe(0)
  })
})

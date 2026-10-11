import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// Holds the dependency diet in place: every runtime dependency is justified in DEPENDENCIES.md,
// target-specific tooling stays an optional peer, and the web-only install stays within budget

const repo = join(__dirname, '..')
const read = (path: string) => JSON.parse(readFileSync(join(repo, path), 'utf8'))

const PACKAGES = {
  '@commoners/solidarity': 'packages/core/package.json',
  commoners: 'packages/cli/package.json',
  '@commoners/testing': 'packages/testing/package.json',
}

// Names listed under one "## <package>" section of DEPENDENCIES.md as "- `name`: reason"
const ledger = (pkg: string) => {
  const text = readFileSync(join(repo, 'DEPENDENCIES.md'), 'utf8')
  const section = text.split(/^## /m).find(s => s.startsWith(pkg + ' ') || s.startsWith(pkg + '\n'))
  return [...(section ?? '').matchAll(/^- `([^`]+)`:\s*\S/gm)].map(m => m[1]).sort()
}

// Raise only together with a DEPENDENCIES.md change that explains the new packages
const FOOTPRINT_BUDGET = 260

const DESKTOP_AND_PWA = [
  'electron',
  'electron-builder',
  'electron-builder-squirrel-windows',
  '@electron/fuses',
  '@electron/notarize',
  'vite-plugin-pwa',
]

describe('dependency ledger', () => {
  for (const [name, path] of Object.entries(PACKAGES)) {
    test(`${name}: every runtime dependency is justified, and nothing else is listed`, () => {
      expect(ledger(name)).toEqual(Object.keys(read(path).dependencies ?? {}).sort())
    })
  }
})

describe('target tooling is optional', () => {
  test('desktop and PWA tooling are optional peers of core, not dependencies', () => {
    const core = read(PACKAGES['@commoners/solidarity'])
    for (const name of DESKTOP_AND_PWA) {
      expect(core.dependencies?.[name], name).toBeUndefined()
      expect(core.peerDependenciesMeta?.[name]?.optional, name).toBe(true)
    }
  })

  test(`core's production install stays within ${FOOTPRINT_BUDGET} packages`, () => {
    const output = execFileSync(
      'pnpm',
      ['--filter', '@commoners/solidarity', 'list', '--prod', '--depth', 'Infinity', '--json'],
      { cwd: repo, encoding: 'utf8', shell: process.platform === 'win32' }
    )
    const seen = new Set<string>()
    const walk = (deps: Record<string, any> = {}) => {
      for (const [name, info] of Object.entries(deps)) {
        const key = `${name}@${info.version}`
        if (seen.has(key)) continue
        seen.add(key)
        walk(info.dependencies)
      }
    }
    for (const pkg of JSON.parse(output)) {
      walk(pkg.dependencies)
      walk(pkg.optionalDependencies)
    }
    expect([...seen].filter(k => k.startsWith('electron-builder@'))).toEqual([])
    expect(seen.size).toBeLessThanOrEqual(FOOTPRINT_BUDGET)
  }, 60000)
})

describe('accepted advisories', () => {
  // Every advisory the audit ignores is documented, with its reason, in SECURITY.md (and vice versa)
  test('pnpm.auditConfig.ignoreGhsas matches the SECURITY.md table', () => {
    const ignored = [...(read('package.json').pnpm?.auditConfig?.ignoreGhsas ?? [])].sort()
    const security = readFileSync(join(repo, 'SECURITY.md'), 'utf8')
    const table = security.split('## Dependency advisories')[1]?.split('\n## ')[0] ?? ''
    const documented = [
      ...new Set(table.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g) ?? []),
    ].sort()
    expect(ignored).toEqual(documented)
  })
})

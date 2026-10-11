import { describe, test, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import {
  packageDirOf,
  npmPurl,
  cargoLockComponents,
  pythonRequirements,
  createSBOM,
  buildTimestamp,
  hashTree,
  hashInstallers,
  checkFeatureCanaries,
  featureCanaries,
  createSARIF,
  writeRecord,
  parseJUnit,
  attachTestResults,
  supplierOf,
  dependencyGraph,
  cargoSupplier,
} from '../packages/core/utils/build-record'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const p = (...parts: string[]) => parts.join(sep)
const tool = { name: '@commoners/solidarity', version: '1.0.0' }

describe('bundle inventory', () => {
  test('finds the package directory for plain, scoped and nested modules', () => {
    expect(packageDirOf(p('', 'app', 'node_modules', 'lodash', 'map.js'))).toBe(
      p('', 'app', 'node_modules', 'lodash')
    )
    expect(packageDirOf(p('', 'app', 'node_modules', '@scope', 'pkg', 'dist', 'x.js'))).toBe(
      p('', 'app', 'node_modules', '@scope', 'pkg')
    )
    // pnpm layout: the last node_modules segment names the package
    expect(
      packageDirOf(
        p('', 'app', 'node_modules', '.pnpm', 'a@1.0.0', 'node_modules', 'a', 'i.js') + '?commonjs'
      )
    ).toBe(p('', 'app', 'node_modules', '.pnpm', 'a@1.0.0', 'node_modules', 'a'))
  })

  test('project files are not packages', () => {
    expect(packageDirOf(p('', 'app', 'src', 'main.ts'))).toBeNull()
    expect(packageDirOf('\0vite/preload-helper')).toBeNull()
  })

  test('npm purls percent-encode the scope', () => {
    expect(npmPurl('@scope/pkg', '2.0.0')).toBe('pkg:npm/%40scope/pkg@2.0.0')
    expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
  })
})

describe('lockfiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commoners-record-'))

  test('Cargo.lock: registry crates get purls, path crates do not', () => {
    const lock = join(dir, 'Cargo.lock')
    writeFileSync(
      lock,
      `version = 4

[[package]]
name = "serde"
version = "1.0.210"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "my-plugin"
version = "0.1.0"
`
    )
    expect(cargoLockComponents(lock, [])).toEqual([
      { type: 'library', name: 'serde', version: '1.0.210', purl: 'pkg:cargo/serde@1.0.210' },
      { type: 'library', name: 'my-plugin', version: '0.1.0' },
    ])
    expect(cargoLockComponents(join(dir, 'missing.lock'))).toEqual([])
  })

  test('requirements.txt: pinned become components, the rest are reported', () => {
    const file = join(dir, 'requirements.txt')
    writeFileSync(
      file,
      'numpy==2.1.0\n# comment\nscipy>=1.10\nrequests[socks]==2.32.3 ; python_version > "3"\n-r other.txt\n'
    )
    const { components, unresolved } = pythonRequirements(file)
    expect(components.map(c => c.purl)).toEqual([
      'pkg:pypi/numpy@2.1.0',
      'pkg:pypi/requests@2.32.3',
    ])
    expect(unresolved).toEqual(['scipy>=1.10'])
  })
})

describe('SBOM', () => {
  const app = { name: 'demo', version: '1.2.3' }
  const a = {
    type: 'library' as const,
    name: 'a',
    version: '1.0.0',
    purl: 'pkg:npm/a@1.0.0',
    license: 'MIT',
  }
  const b = { type: 'library' as const, name: 'b', version: '2.0.0', purl: 'pkg:npm/b@2.0.0' }

  test('is CycloneDX 1.5 with deduplicated, sorted components', () => {
    const sbom = createSBOM(app, [b, a, a], { tool, timestamp: '2026-01-01T00:00:00.000Z' })
    expect(sbom.bomFormat).toBe('CycloneDX')
    expect(sbom.specVersion).toBe('1.5')
    expect(sbom.metadata.component).toEqual({
      type: 'application',
      'bom-ref': 'app:demo@1.2.3',
      name: 'demo',
      version: '1.2.3',
    })
    expect(sbom.components.map((c: any) => c.purl)).toEqual(['pkg:npm/a@1.0.0', 'pkg:npm/b@2.0.0'])
    expect(sbom.components[0].licenses).toEqual([{ expression: 'MIT' }])
  })

  test('same inputs give the same serial number; different inputs do not', () => {
    const options = { tool, timestamp: '2026-01-01T00:00:00.000Z' }
    const first = createSBOM(app, [a, b], options)
    expect(createSBOM(app, [b, a], options).serialNumber).toBe(first.serialNumber)
    expect(createSBOM(app, [a], options).serialNumber).not.toBe(first.serialNumber)
    expect(first.serialNumber).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  test('a single-file service carries a SHA-256 hash', () => {
    const service = {
      type: 'application' as const,
      name: 'svc',
      version: '1.2.3',
      hashes: [{ path: 'svc', sha256: 'ab'.repeat(32) }],
    }
    const [component] = createSBOM(app, [service], { tool, timestamp: 'x' }).components as any[]
    expect(component.hashes).toEqual([{ alg: 'SHA-256', content: 'ab'.repeat(32) }])
  })
})

describe('hashing and time', () => {
  test('SOURCE_DATE_EPOCH fixes the timestamp', () => {
    expect(buildTimestamp({ SOURCE_DATE_EPOCH: '1700000000' })).toBe('2023-11-14T22:13:20.000Z')
  })

  test('hashTree lists every file with its SHA-256, sorted, with forward slashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-hash-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), 'hello')
    writeFileSync(join(dir, 'assets', 'app.js'), '')
    expect(hashTree(dir)).toEqual([
      {
        path: 'assets/app.js',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      {
        path: 'index.html',
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      },
    ])
  })

  test('installers are hashed; frontend files and other files are not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-inst-'))
    writeFileSync(join(dir, 'App-1.0.0.dmg'), 'x')
    writeFileSync(join(dir, 'index.html'), 'y')
    writeFileSync(join(dir, 'bundle.zip'), 'z')
    expect(hashInstallers(dir, new Set(['bundle.zip'])).map(f => f.path)).toEqual(['App-1.0.0.dmg'])
  })
})

describe('feature canaries', () => {
  const build = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-canary-'))
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true })
      writeFileSync(join(dir, name), text)
    }
    return dir
  }

  test('verifies absence of disabled and presence of enabled features', () => {
    const dir = build({ 'assets/app.js': 'render("export-canary")', 'index.html': '<p>' })
    const check = checkFeatureCanaries(
      dir,
      { export: true, telemetry: false, other: false },
      { export: ['export-canary'], telemetry: ['telemetry-canary'] }
    )
    expect(check.presence).toEqual({ export: 'verified' })
    expect(check.absence).toEqual({ telemetry: 'verified' })
    expect(check.unchecked).toEqual(['other'])
    expect(check.violations).toEqual([])
  })

  // The gate must fail when a disabled feature's code ships anyway (mutation: flag ignored)
  test('a disabled feature whose canary ships is a violation, with the file', () => {
    const dir = build({ 'assets/app.js': 'send("telemetry-canary")' })
    const check = checkFeatureCanaries(
      dir,
      { telemetry: false },
      { telemetry: ['telemetry-canary'] }
    )
    expect(check.absence).toEqual({ telemetry: 'violated' })
    expect(check.violations).toEqual([
      { kind: 'absence', feature: 'telemetry', canary: 'telemetry-canary', file: 'assets/app.js' },
    ])
  })

  test('an enabled feature whose canary is missing is a violation (positive control)', () => {
    const dir = build({ 'assets/app.js': '' })
    const check = checkFeatureCanaries(dir, { export: true }, { export: ['export-canary'] })
    expect(check.presence).toEqual({ export: 'violated' })
    expect(check.violations[0]).toMatchObject({ kind: 'presence', canary: 'export-canary' })
  })

  test('a shipped source map counts: it carries the removed source', () => {
    const dir = build({
      'assets/app.js.map': '{"sourcesContent":["if (false) send(\\"telemetry-canary\\")"]}',
    })
    const check = checkFeatureCanaries(
      dir,
      { telemetry: false },
      { telemetry: ['telemetry-canary'] }
    )
    expect(check.absence).toEqual({ telemetry: 'violated' })
  })

  test('canaries come only from object declarations', () => {
    expect(
      featureCanaries({ a: true, b: { enabled: false, canaries: ['x'] }, c: () => true })
    ).toEqual({
      a: [],
      b: ['x'],
      c: [],
    })
  })
})

describe('SARIF and record files', () => {
  test('SARIF 2.1.0 with rules and located results', () => {
    const sarif = createSARIF(tool, [
      { ruleId: 'feature-absence', level: 'error', message: 'm', file: 'assets/app.js' },
      { ruleId: 'feature-presence', level: 'error', message: 'n' },
    ]) as any
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].tool.driver.rules.map((r: any) => r.id)).toEqual([
      'feature-absence',
      'feature-presence',
      'no-eval',
    ])
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'assets/app.js'
    )
    expect(sarif.runs[0].results[1].locations).toBeUndefined()
  })

  test('the manifest records the hash of the SBOM and scan files it sits beside', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-write-'))
    writeRecord(dir, { bomFormat: 'CycloneDX' }, { app: 'x' }, createSARIF(tool, []))
    const manifest = JSON.parse(readFileSync(join(dir, 'commoners.manifest.json'), 'utf8'))
    const sbomText = readFileSync(join(dir, 'commoners.sbom.cdx.json'), 'utf8')
    expect(manifest.sbom).toEqual({
      path: 'commoners.sbom.cdx.json',
      sha256: createHash('sha256').update(sbomText).digest('hex'),
    })
    expect(manifest.scan.path).toBe('commoners.scan.sarif')
  })

  test('a failed build writes the scan alone and removes the previous records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-scan-'))
    writeRecord(dir, { bomFormat: 'CycloneDX' }, { app: 'previous' }) // An earlier, successful build
    writeRecord(dir, null, null, createSARIF(tool, []))
    expect(existsSync(join(dir, 'commoners.scan.sarif'))).toBe(true)
    expect(existsSync(join(dir, 'commoners.manifest.json'))).toBe(false)
    expect(existsSync(join(dir, 'commoners.sbom.cdx.json'))).toBe(false)
  })
})

describe('test results', () => {
  const junit = `<?xml version="1.0"?>
<testsuites name="vitest" tests="5" failures="1" errors="0" time="1.2">
  <testsuite name="a.test.ts" tests="3" failures="1" errors="0" skipped="1" time="0.5"></testsuite>
  <testsuite name="b.test.ts" tests="2" failures="0" errors="0" skipped="0" time="0.7"></testsuite>
</testsuites>`

  test('JUnit totals are summed over testsuites', () => {
    expect(parseJUnit(junit)).toEqual({ tests: 5, failures: 1, errors: 0, skipped: 1 })
  })

  test('results are tied to the manifest they exercised, by hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-tests-'))
    writeRecord(dir, { bomFormat: 'CycloneDX' }, { app: 'x' })
    const report = join(dir, 'e2e.xml')
    writeFileSync(report, junit)
    const record = attachTestResults(dir, [report], { SOURCE_DATE_EPOCH: '1700000000' })
    const manifestText = readFileSync(join(dir, 'commoners.manifest.json'))
    expect(record.manifest.sha256).toBe(createHash('sha256').update(manifestText).digest('hex'))
    expect(record.passed).toBe(false)
    expect(record.results[0]).toMatchObject({ tests: 5, failures: 1 })
    expect(existsSync(join(dir, 'commoners.tests.json'))).toBe(true)
  })

  test('refuses without a build record or with an empty report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-tests-'))
    const report = join(dir, 'e2e.xml')
    writeFileSync(report, '<testsuites></testsuites>')
    expect(() => attachTestResults(dir, [report])).toThrow(/No build record/)
    writeRecord(dir, null, { app: 'x' })
    expect(() => attachTestResults(dir, [report])).toThrow(/no JUnit/)
  })
})

describe('NTIA minimum elements', () => {
  test('supplier comes from the package author, in either form', () => {
    expect(supplierOf('Jane Doe <jane@example.com> (https://example.com)')).toBe('Jane Doe')
    expect(supplierOf({ name: 'Example Org', email: 'x@example.com' })).toBe('Example Org')
    expect(supplierOf(undefined)).toBeUndefined()
    expect(supplierOf('   ')).toBeUndefined()
  })

  test('dependency graph links included components; the app points at the direct ones', () => {
    const a = {
      type: 'library' as const,
      name: 'a',
      version: '1.0.0',
      purl: 'pkg:npm/a@1.0.0',
      dependsOn: ['b', 'not-bundled'],
    }
    const b = { type: 'library' as const, name: 'b', version: '2.0.0', purl: 'pkg:npm/b@2.0.0' }
    expect(dependencyGraph('app:x@1', [a, b])).toEqual([
      { ref: 'app:x@1', dependsOn: ['pkg:npm/a@1.0.0'] },
      { ref: 'pkg:npm/a@1.0.0', dependsOn: ['pkg:npm/b@2.0.0'] },
      { ref: 'pkg:npm/b@2.0.0', dependsOn: [] },
    ])
  })

  test('Cargo.lock dependency lists become edges', () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-cargo-'))
    const lock = join(dir, 'Cargo.lock')
    writeFileSync(
      lock,
      `[[package]]
name = "app"
version = "0.1.0"
dependencies = [
 "serde",
 "syn 2.0.1",
]

[[package]]
name = "serde"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
`
    )
    expect(cargoLockComponents(lock, [])[0].dependsOn).toEqual(['serde', 'syn'])
  })

  test('SBOM carries suppliers, authors, a root ref and the graph', () => {
    const a = {
      type: 'library' as const,
      name: 'a',
      version: '1.0.0',
      purl: 'pkg:npm/a@1.0.0',
      supplier: 'A Corp',
    }
    const sbom = createSBOM({ name: 'demo', version: '1.0.0', supplier: 'Demo Inc' }, [a], {
      tool,
      timestamp: 't',
    }) as any
    expect(sbom.metadata.authors).toEqual([{ name: 'Demo Inc' }])
    expect(sbom.metadata.supplier).toEqual({ name: 'Demo Inc' })
    expect(sbom.metadata.component['bom-ref']).toBe('app:demo@1.0.0')
    expect(sbom.components[0].supplier).toEqual({ name: 'A Corp' })
    expect(sbom.dependencies[0]).toEqual({ ref: 'app:demo@1.0.0', dependsOn: ['pkg:npm/a@1.0.0'] })
  })

  test('without a declared app supplier, no author is invented', () => {
    const sbom = createSBOM({ name: 'demo', version: '1.0.0' }, [], { tool, timestamp: 't' }) as any
    expect(sbom.metadata.authors).toBeUndefined()
    expect(sbom.metadata.supplier).toBeUndefined()
  })
})

describe('crate suppliers', () => {
  test("read from the registry copy of the crate's Cargo.toml", () => {
    const registry = mkdtempSync(join(tmpdir(), 'commoners-registry-'))
    mkdirSync(join(registry, 'serde-1.0.0'))
    writeFileSync(
      join(registry, 'serde-1.0.0', 'Cargo.toml'),
      '[package]\nname = "serde"\nauthors = [\n  "Erich Gamma <e@example.com>",\n  "Other",\n]\n'
    )
    expect(cargoSupplier('serde', '1.0.0', [registry])).toBe('Erich Gamma')
    expect(cargoSupplier('missing', '1.0.0', [registry])).toBeUndefined()
  })
})

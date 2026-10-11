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
    expect(cargoLockComponents(lock)).toEqual([
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
    expect(sbom.metadata.component).toEqual({ type: 'application', name: 'demo', version: '1.2.3' })
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

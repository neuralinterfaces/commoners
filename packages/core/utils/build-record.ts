/**
 * Build record: what a production build contains, written next to the build (never inside a
 * deployable output, so a website does not publish its own SBOM).
 *
 * - commoners.sbom.cdx.json — CycloneDX 1.5 SBOM of what ships: the packages the bundler pulled
 *   into the frontend, the desktop runtime, Rust crates from lockfiles, pinned Python requirements,
 *   and each built service with its file hashes.
 * - commoners.manifest.json — the build's settings and contents: target, features, security
 *   settings, SHA-256 of every frontend, service and installer file, the source commit, and what
 *   the SBOM could not itemize.
 *
 * SOURCE_DATE_EPOCH, when set, fixes the timestamp so the same inputs produce the same records.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

export type FileHash = { path: string; sha256: string }

export type Component = {
  type: 'library' | 'framework' | 'application'
  name: string
  version: string
  purl?: string
  license?: string
  hashes?: FileHash[]
}

// ------------------------ Bundle inventory ------------------------
// Packages the bundler actually included, keyed by project root. Reset at the start of each build

const inventories = new Map<string, Map<string, Component>>()

export const resetInventory = (root: string) => inventories.set(root, new Map())
export const getInventory = (root: string) => [...(inventories.get(root)?.values() ?? [])]

const NODE_MODULES = `node_modules${sep}`

/** Package directory for a module id inside node_modules, or null for project files */
export const packageDirOf = (id: string): string | null => {
  const path = id.replace(/^\0/, '').split('?')[0]
  const index = path.lastIndexOf(NODE_MODULES)
  if (index === -1) return null
  const rest = path.slice(index + NODE_MODULES.length).split(sep)
  const nameParts = rest[0]?.startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
  if (!nameParts.length || nameParts.some(p => !p)) return null
  return path.slice(0, index + NODE_MODULES.length) + nameParts.join(sep)
}

export const npmPurl = (name: string, version: string) =>
  `pkg:npm/${name.startsWith('@') ? '%40' + name.slice(1) : name}@${version}`

const readPackage = (dir: string): Component | null => {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (!pkg.name || !pkg.version) return null
    const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
    return {
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      purl: npmPurl(pkg.name, pkg.version),
      ...(license ? { license } : {}),
    }
  } catch {
    return null
  }
}

/** Records every node_modules package that ends up in an emitted chunk */
export const bundleInventoryPlugin = (root: string): Plugin => ({
  name: 'commoners:bundle-inventory',
  apply: 'build',
  generateBundle(_, bundle) {
    const inventory = inventories.get(root) ?? inventories.set(root, new Map()).get(root)!
    const seen = new Set<string>()
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue
      for (const id of Object.keys(chunk.modules)) {
        const dir = packageDirOf(id)
        if (!dir || seen.has(dir)) continue
        seen.add(dir)
        const component = readPackage(dir)
        if (component) inventory.set(`${component.name}@${component.version}`, component)
      }
    }
  },
})

// ------------------------ Lockfiles ------------------------

/** Crates from a Cargo.lock. Path dependencies (no source) are local code, listed without a purl */
export const cargoLockComponents = (lockfile: string): Component[] => {
  if (!existsSync(lockfile)) return []
  return readFileSync(lockfile, 'utf8')
    .split('[[package]]')
    .slice(1)
    .map(block => {
      const field = (key: string) => block.match(new RegExp(`^${key} = "([^"]*)"`, 'm'))?.[1]
      const name = field('name')
      const version = field('version')
      if (!name || !version) return null
      const fromRegistry = field('source')?.startsWith('registry+')
      return {
        type: 'library' as const,
        name,
        version,
        ...(fromRegistry ? { purl: `pkg:cargo/${name}@${version}` } : {}),
      }
    })
    .filter(Boolean) as Component[]
}

/** Pinned (==) requirements become components; anything else is reported as unresolved */
export const pythonRequirements = (file: string) => {
  const components: Component[] = []
  const unresolved: string[] = []
  if (!existsSync(file)) return { components, unresolved }
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line || line.startsWith('-')) continue
    const pinned = line.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([^\s;]+)/)
    if (pinned)
      components.push({
        type: 'library',
        name: pinned[1],
        version: pinned[2],
        purl: `pkg:pypi/${pinned[1].toLowerCase()}@${pinned[2]}`,
      })
    else unresolved.push(line)
  }
  return { components, unresolved }
}

// ------------------------ Hashing ------------------------

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** SHA-256 of every file under a directory, sorted by path (relative, forward slashes) */
export const hashTree = (dir: string, base = dir): FileHash[] => {
  if (!existsSync(dir)) return []
  const out: FileHash[] = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...hashTree(full, base))
    else if (stat.isFile())
      out.push({
        path: relative(base, full).split(sep).join('/'),
        sha256: sha256(readFileSync(full)),
      })
  }
  return out
}

const INSTALLER = /\.(dmg|zip|exe|msi|AppImage|deb|rpm|apk|aab|ipa|pkg|snap)$/i

/** Installers and archives produced by packaging (directories such as .app bundles are skipped) */
export const hashInstallers = (dir: string, exclude: Set<string>): FileHash[] =>
  hashTree(dir).filter(f => INSTALLER.test(f.path) && !exclude.has(f.path))

// ------------------------ Source ------------------------

const git = (root: string, args: string[]) => {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

export const sourceState = (root: string) => {
  const commit = git(root, ['rev-parse', 'HEAD'])
  if (!commit) return null
  return { commit, dirty: !!git(root, ['status', '--porcelain']) }
}

export const buildTimestamp = (env = process.env) =>
  new Date(env.SOURCE_DATE_EPOCH ? Number(env.SOURCE_DATE_EPOCH) * 1000 : Date.now()).toISOString()

// ------------------------ Documents ------------------------

/** Deterministic urn:uuid (version 5 layout) derived from the BOM content */
const contentUuid = (content: string) => {
  const h = sha256(content)
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const toCycloneDX = (c: Component) => ({
  type: c.type,
  'bom-ref': c.purl ?? `${c.name}@${c.version}`,
  name: c.name,
  version: c.version,
  ...(c.purl ? { purl: c.purl } : {}),
  ...(c.license ? { licenses: [{ expression: c.license }] } : {}),
  ...(c.hashes?.length
    ? {
        // One file: its hash is the component's. Several: each file's hash as a property
        ...(c.hashes.length === 1
          ? { hashes: [{ alg: 'SHA-256', content: c.hashes[0].sha256 }] }
          : {}),
        properties: c.hashes.map(h => ({ name: `commoners:file:${h.path}`, value: h.sha256 })),
      }
    : {}),
})

export const createSBOM = (
  app: { name: string; version: string },
  components: Component[],
  { tool, timestamp }: { tool: { name: string; version: string }; timestamp: string }
) => {
  const unique = [...new Map(components.map(c => [c.purl ?? `${c.name}@${c.version}`, c])).values()]
  unique.sort((a, b) => (a.purl ?? a.name).localeCompare(b.purl ?? b.name))
  const body = {
    metadata: {
      timestamp,
      tools: { components: [{ type: 'application', name: tool.name, version: tool.version }] },
      component: { type: 'application', name: app.name, version: app.version },
    },
    components: unique.map(toCycloneDX),
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: contentUuid(JSON.stringify(body)),
    version: 1,
    ...body,
  }
}

// ------------------------ Runtime lookups ------------------------

export const installedPackage = (root: string, name: string): Component | null => {
  try {
    const require = createRequire(join(root, 'package.json'))
    return readPackage(dirname(require.resolve(`${name}/package.json`)))
  } catch {
    return null
  }
}

export const writeRecord = (
  outDir: string,
  sbom: object | null,
  manifest: Record<string, any> | null,
  sarif?: object
) => {
  mkdirSync(outDir, { recursive: true })
  const written: Record<string, string> = {}
  const extra: Record<string, { path: string; sha256: string }> = {}
  const put = (name: string, value: object) => {
    const text = JSON.stringify(value, null, 2) + '\n'
    writeFileSync(join(outDir, name), text)
    written[name] = join(outDir, name)
    return { path: name, sha256: sha256(text) }
  }
  if (sarif) extra.scan = put('commoners.scan.sarif', sarif)
  if (sbom) extra.sbom = put('commoners.sbom.cdx.json', sbom)
  if (manifest) put('commoners.manifest.json', { ...manifest, ...extra })
  // A failed build writes its scan alone: drop a previous build's records so they can't pass for it
  else
    for (const name of ['commoners.manifest.json', 'commoners.sbom.cdx.json'])
      rmSync(join(outDir, name), { force: true })
  return written
}

// ------------------------ Feature absence / presence ------------------------
// A feature's canaries are strings that exist only in its code. In the built output a disabled
// feature's canaries must be absent, and an enabled feature's must be present: the positive
// control that proves the scan can see that code at all. Source maps are scanned too: a shipped
// map carries the original source, including branches the bundler removed.

const TEXT_FILE = /\.(m?js|cjs|html?|css|json|map|svg|txt|webmanifest)$/i

export type CanaryHit = { feature: string; canary: string; file: string }
export type FeatureCheck = {
  absence: Record<string, 'verified' | 'violated'>
  presence: Record<string, 'verified' | 'violated'>
  unchecked: string[]
  violations: (CanaryHit & { kind: 'absence' | 'presence' })[]
}

export const checkFeatureCanaries = (
  dir: string,
  features: Record<string, boolean>,
  canaries: Record<string, string[]>
): FeatureCheck => {
  const texts = hashTree(dir)
    .filter(f => TEXT_FILE.test(f.path))
    .map(f => ({ path: f.path, text: readFileSync(join(dir, f.path), 'utf8') }))

  const result: FeatureCheck = { absence: {}, presence: {}, unchecked: [], violations: [] }
  for (const [feature, enabled] of Object.entries(features)) {
    const list = canaries[feature] ?? []
    if (!list.length) {
      result.unchecked.push(feature)
      continue
    }
    const hits = list.flatMap(canary =>
      texts.filter(t => t.text.includes(canary)).map(t => ({ feature, canary, file: t.path }))
    )
    if (enabled) {
      // Every canary of an enabled feature must be found somewhere
      const missing = list.filter(canary => !hits.some(h => h.canary === canary))
      result.presence[feature] = missing.length ? 'violated' : 'verified'
      for (const canary of missing)
        result.violations.push({ kind: 'presence', feature, canary, file: '' })
    } else {
      result.absence[feature] = hits.length ? 'violated' : 'verified'
      for (const hit of hits) result.violations.push({ kind: 'absence', ...hit })
    }
  }
  return result
}

export const featureCanaries = (declared: Record<string, any> | undefined) =>
  Object.fromEntries(
    Object.entries(declared ?? {}).map(([name, d]) => [
      name,
      d && typeof d === 'object' && Array.isArray(d.canaries) ? d.canaries.map(String) : [],
    ])
  )

// ------------------------ SARIF ------------------------
// Scan results in SARIF 2.1.0 (OASIS), the format code-scanning tools read

export type ScanFinding = {
  ruleId: string
  level: 'error' | 'warning' | 'note'
  message: string
  file?: string
}

const SARIF_RULES: Record<string, string> = {
  'feature-absence': "A disabled feature's canary appears in the build output",
  'feature-presence': "An enabled feature's canary is missing from the build output",
  'no-eval': 'eval-like code that the Content Security Policy blocks at runtime',
}

export const createSARIF = (tool: { name: string; version: string }, findings: ScanFinding[]) => ({
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: tool.name,
          version: tool.version,
          rules: Object.entries(SARIF_RULES).map(([id, text]) => ({
            id,
            shortDescription: { text },
          })),
        },
      },
      results: findings.map(f => ({
        ruleId: f.ruleId,
        level: f.level,
        message: { text: f.message },
        ...(f.file
          ? { locations: [{ physicalLocation: { artifactLocation: { uri: f.file } } }] }
          : {}),
      })),
    },
  ],
})

// no-eval hits from the bundler, per project root, collected for the SARIF report
const evalFindings = new Map<string, ScanFinding[]>()
export const resetEvalFindings = (root: string) => evalFindings.set(root, [])
export const addEvalFinding = (root: string, finding: ScanFinding) =>
  (evalFindings.get(root) ?? evalFindings.set(root, []).get(root)!).push(finding)
export const getEvalFindings = (root: string) => evalFindings.get(root) ?? []

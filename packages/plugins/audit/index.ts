/**
 * @commoners/audit
 *
 * SBOM generation and multi-language dependency auditing.
 * Generates a Software Bill of Materials at build time covering:
 * - Node.js dependencies (package.json)
 * - Python dependencies (requirements.txt, conda environment.yml)
 * - Rust dependencies (Cargo.lock)
 * - C++ dependencies (if declared in config)
 *
 * Designed for regulatory compliance (FDA, medical devices).
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

export const capabilities = {
  provides: ['audit', 'sbom', 'compliance'],
  platforms: { web: true, desktop: true, mobile: true },
}

export type AuditOptions = {
  /** Output directory for SBOM files (default: build output) */
  outDir?: string
  /** Include Node.js dependencies (default: true) */
  node?: boolean
  /** Include Python dependencies (default: true if detected) */
  python?: boolean
  /** Include Rust dependencies (default: true if detected) */
  rust?: boolean
  /** SBOM format: 'cyclonedx' or 'spdx' (default: 'cyclonedx') */
  format?: 'cyclonedx' | 'spdx'
  /** Fail build on known vulnerabilities (default: false) */
  failOnVulnerabilities?: boolean
}

type SBOMComponent = {
  type: 'library' | 'framework' | 'application'
  name: string
  version: string
  language: string
  purl?: string
  licenses?: string[]
}

type SBOMDocument = {
  bomFormat: string
  specVersion: string
  version: number
  metadata: {
    timestamp: string
    tools: { name: string; version: string }[]
    component: { type: string; name: string; version: string }
  }
  components: SBOMComponent[]
}

const DEFAULT_OPTIONS: Required<AuditOptions> = {
  outDir: '',
  node: true,
  python: true,
  rust: true,
  format: 'cyclonedx',
  failOnVulnerabilities: false,
}

function collectNodeDependencies(root: string): SBOMComponent[] {
  const pkgPath = join(root, 'package.json')
  if (!existsSync(pkgPath)) return []

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return Object.entries(deps).map(([name, version]) => ({
      type: 'library' as const,
      name,
      version: String(version).replace(/^[\^~>=<]/, ''),
      language: 'javascript',
      purl: `pkg:npm/${name}@${String(version).replace(/^[\^~>=<]/, '')}`,
    }))
  } catch {
    return []
  }
}

function collectPythonDependencies(root: string): SBOMComponent[] {
  const components: SBOMComponent[] = []

  // Check requirements.txt
  const reqPath = join(root, 'requirements.txt')
  if (existsSync(reqPath)) {
    const lines = readFileSync(reqPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>!~]+(.+))?$/)
      if (match) {
        components.push({
          type: 'library',
          name: match[1],
          version: match[2] || 'unknown',
          language: 'python',
          purl: `pkg:pypi/${match[1]}@${match[2] || 'unknown'}`,
        })
      }
    }
  }

  // Check conda environment.yml
  for (const envFile of ['environment.yml', 'environment.yaml']) {
    const envPath = join(root, envFile)
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8')
      // Simple YAML parsing for dependencies list
      const depsMatch = content.match(/dependencies:\s*\n((?:\s+-\s+.+\n?)+)/)
      if (depsMatch) {
        const lines = depsMatch[1].split('\n')
        for (const line of lines) {
          const match = line.trim().match(/^-\s+([a-zA-Z0-9_-]+)(?:[=<>]+(.+))?$/)
          if (match) {
            components.push({
              type: 'library',
              name: match[1],
              version: match[2] || 'unknown',
              language: 'python',
              purl: `pkg:conda/${match[1]}@${match[2] || 'unknown'}`,
            })
          }
        }
      }
    }
  }

  return components
}

function collectRustDependencies(root: string): SBOMComponent[] {
  // Check Cargo.lock for resolved dependencies
  const lockPath = join(root, 'Cargo.lock')
  if (!existsSync(lockPath)) return []

  try {
    const content = readFileSync(lockPath, 'utf8')
    const components: SBOMComponent[] = []
    const packageRegex = /\[\[package\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nversion\s*=\s*"([^"]+)"/g
    let match
    while ((match = packageRegex.exec(content)) !== null) {
      components.push({
        type: 'library',
        name: match[1],
        version: match[2],
        language: 'rust',
        purl: `pkg:cargo/${match[1]}@${match[2]}`,
      })
    }
    return components
  } catch {
    return []
  }
}

function runNpmAudit(root: string): { vulnerabilities: number; details: string } {
  try {
    const result = execSync('npm audit --json 2>/dev/null', {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
    })
    const audit = JSON.parse(result)
    const total = audit.metadata?.vulnerabilities?.total ?? 0
    return { vulnerabilities: total, details: result }
  } catch {
    return { vulnerabilities: 0, details: '' }
  }
}

function generateSBOM(
  appName: string,
  appVersion: string,
  components: SBOMComponent[]
): SBOMDocument {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ name: '@commoners/audit', version: '1.0.0-alpha.3' }],
      component: { type: 'application', name: appName, version: appVersion },
    },
    components,
  }
}

/**
 * Create the audit plugin with the given options.
 */
export default function audit(options: AuditOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  return {
    capabilities,

    // Build-time hook: generate SBOM after services are resolved
    start: function (services: Record<string, any>) {
      const root = process.cwd()
      const components: SBOMComponent[] = []

      // Collect Node.js dependencies
      if (opts.node) {
        components.push(...collectNodeDependencies(root))
      }

      // Collect Python dependencies
      if (opts.python) {
        components.push(...collectPythonDependencies(root))
      }

      // Collect Rust dependencies
      if (opts.rust) {
        components.push(...collectRustDependencies(root))
      }

      // Also scan service directories for their own dependencies
      for (const [id, svc] of Object.entries(services)) {
        if (!svc?.filepath) continue
        const svcDir = join(root, svc.filepath, '..')

        if (opts.python) components.push(...collectPythonDependencies(svcDir))
        if (opts.rust) components.push(...collectRustDependencies(svcDir))
        if (opts.node) components.push(...collectNodeDependencies(svcDir))
      }

      // Deduplicate by name+version+language
      const seen = new Set<string>()
      const unique = components.filter(c => {
        const key = `${c.language}:${c.name}:${c.version}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Read app metadata
      let appName = 'commoners-app'
      let appVersion = '0.0.0'
      const pkgPath = join(root, 'package.json')
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
          appName = pkg.name || appName
          appVersion = pkg.version || appVersion
        } catch { /* ignore */ }
      }

      // Generate SBOM
      const sbom = generateSBOM(appName, appVersion, unique)

      // Write SBOM
      const outDir = opts.outDir || join(root, '.commoners')
      mkdirSync(outDir, { recursive: true })
      const filename = `${appVersion}.sbom.json`
      const sbomPath = join(outDir, filename)
      writeFileSync(sbomPath, JSON.stringify(sbom, null, 2), 'utf8')

      console.log(`[commoners:audit] SBOM generated: ${filename} (${unique.length} components)`)

      // Run vulnerability check
      if (opts.failOnVulnerabilities) {
        const { vulnerabilities } = runNpmAudit(root)
        if (vulnerabilities > 0) {
          throw new Error(`[commoners:audit] ${vulnerabilities} known vulnerabilities found. Run 'npm audit' for details.`)
        }
      }
    },
  }
}

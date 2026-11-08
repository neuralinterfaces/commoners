#!/usr/bin/env node
// Dependency audit split by what ships.
//
// Fails on a high or critical advisory reached from a published package (packages/*).
// Warns, without failing, on advisories reached only from the docs, examples or the
// repository's own tooling, which no user installs.
//
// Usage: node scripts/audit-shipped.mjs            (runs `pnpm audit --prod --json`)
//        node scripts/audit-shipped.mjs report.json (reads a saved report)

import { execFileSync } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const FAILING = new Set(['high', 'critical'])

// pnpm writes a finding's path either as `packages__core>dep>dep` or as
// `examples/app > @commoners/solidarity@link:../../packages/core > dep@1.0.0 > dep@2.0.0`.
// A dependency ships if any path to it passes through a published package: the path starts
// in packages/, or goes through a workspace link into packages/
const segmentsOf = path => path.split('>').map(segment => segment.trim())
const isPublishedPackage = segment => /@link:(\.\.\/)*packages\//.test(segment)
export const isShippedPath = path => {
  const [importer, ...rest] = segmentsOf(path)
  return importer.replaceAll('__', '/').startsWith('packages/') || rest.some(isPublishedPackage)
}

export const classifyAudit = report => {
  // An error or an empty object must not read as a clean audit
  if (!report || typeof report.advisories !== 'object' || !report.metadata)
    throw new Error(`Not a pnpm audit report: ${JSON.stringify(report).slice(0, 200)}`)
  const shipped = []
  const unshipped = []
  for (const advisory of Object.values(report.advisories ?? {})) {
    const paths = advisory.findings.flatMap(finding => finding.paths)
    const entry = {
      id: advisory.github_advisory_id,
      module: advisory.module_name,
      severity: advisory.severity,
      patched: advisory.patched_versions,
      title: advisory.title,
    }
    const shippedPaths = paths.filter(isShippedPath)
    if (shippedPaths.length) shipped.push({ ...entry, paths: shippedPaths })
    else unshipped.push({ ...entry, paths })
  }
  const failures = shipped.filter(advisory => FAILING.has(advisory.severity))
  return { shipped, unshipped, failures }
}

const readReport = file => {
  if (file) return JSON.parse(readFileSync(file, 'utf8'))
  try {
    return JSON.parse(execFileSync('pnpm', ['audit', '--prod', '--json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }))
  } catch (error) {
    // pnpm audit exits non-zero when it finds anything; the report is still on stdout
    if (error.stdout) return JSON.parse(error.stdout)
    throw error
  }
}

const describe = advisory =>
  `${advisory.severity} ${advisory.module} ${advisory.id}: ${advisory.title} (fixed in ${advisory.patched})\n    via ${advisory.paths[0]}`

const main = () => {
  const { shipped, unshipped, failures } = classifyAudit(readReport(process.argv[2]))
  const warnings = [...shipped.filter(a => !FAILING.has(a.severity)), ...unshipped]

  for (const advisory of warnings) console.log(`::warning::${describe(advisory)}`)
  for (const advisory of failures) console.log(`::error::${describe(advisory)}`)

  console.log(
    `\nShipped packages: ${failures.length} high or critical. ` +
      `Warnings (lower severity, or docs/examples/tooling only): ${warnings.length}.`
  )
  process.exit(failures.length ? 1 : 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

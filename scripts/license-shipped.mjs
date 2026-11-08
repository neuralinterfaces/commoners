// Copyleft licence check for what ships.
//
// Fails when a production dependency of a published package (packages/*, not private) is
// licensed only under GPL-2.0, GPL-3.0 or AGPL-3.0. A dual licence that offers a
// non-copyleft choice, such as `(MIT OR GPL-3.0-or-later)`, passes. Unknown licences are
// reported as warnings so they can be checked by hand.
//
// Usage: node scripts/license-shipped.mjs              (runs `pnpm licenses list --prod --json`
//                                                       in each published package)
//        node scripts/license-shipped.mjs report.json  (reads a saved `pnpm licenses` report)
//
// No `#!` line: the tests import this file, and on a Windows (CRLF) checkout a `#!` line
// makes that import a SyntaxError. Run it with `node`.

import { execFileSync } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const COPYLEFT = /^A?GPL(-[23]\.0)?(-only|-or-later|\+)?$/i

// `(MIT OR GPL-3.0-or-later)` is allowed: the user may take MIT. `(MIT AND GPL-3.0)` is not
export const isCopyleftOnly = expression => {
  const alternatives = expression.replace(/[()]/g, '').split(/\s+OR\s+/i)
  return alternatives.every(alternative =>
    alternative.split(/\s+AND\s+/i).some(part => COPYLEFT.test(part.trim()))
  )
}

export const classifyLicenses = report => {
  // An error or an empty value must not read as a clean check
  if (!report || typeof report !== 'object' || Array.isArray(report))
    throw new Error(`Not a pnpm licenses report: ${JSON.stringify(report).slice(0, 200)}`)
  const failures = []
  const unknown = []
  for (const [license, modules] of Object.entries(report)) {
    const names = modules.map(module => `${module.name}@${module.versions?.join(',') ?? '?'}`)
    if (isCopyleftOnly(license)) failures.push({ license, names })
    else if (/^unknown$/i.test(license)) unknown.push({ license, names })
  }
  return { failures, unknown }
}

const publishedPackages = () =>
  JSON.parse(
    execFileSync('pnpm', ['-r', 'ls', '--json', '--depth', '-1'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  )
    .filter(project => !project.private)
    .map(project => project.path)
    .filter(path => relative(repoRoot, path).split(/[\\/]/)[0] === 'packages')

const licensesOf = dir =>
  JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }) || '{}'
  )

const main = () => {
  const reports = process.argv[2]
    ? [['report', JSON.parse(readFileSync(process.argv[2], 'utf8'))]]
    : publishedPackages().map(dir => [relative(repoRoot, dir), licensesOf(dir)])
  if (!reports.length) throw new Error('No published packages found; refusing to report clean')

  let failed = 0
  for (const [where, report] of reports) {
    const { failures, unknown } = classifyLicenses(report)
    for (const { license, names } of unknown)
      console.log(`::warning::${where}: licence not declared (${license}): ${names.join(', ')}`)
    for (const { license, names } of failures)
      console.log(`::error::${where}: copyleft licence ${license}: ${names.join(', ')}`)
    failed += failures.length
  }

  console.log(`\nChecked ${reports.length} published package(s): ${failed} copyleft finding(s).`)
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

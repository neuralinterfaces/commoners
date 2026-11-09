// Copyleft licence check for what ships.
//
// Fails when a production dependency is licensed only under GPL-2.0, GPL-3.0 or AGPL-3.0. A
// dual licence that offers a non-copyleft choice, such as `(MIT OR GPL-3.0-or-later)`, passes.
// Unknown licences are reported as warnings so they can be checked by hand.
//
// Scope: `pnpm licenses list --prod` reports the production dependencies of the WHOLE
// workspace, wherever it runs (a per-package run returns the same set). So this is one check
// over every production dependency in the workspace: a superset of what the published
// packages ship, which can only make it stricter.
//
// Usage: node scripts/license-shipped.mjs              (runs `pnpm licenses list --prod --json`
//                                                       at the repo root)
//        node scripts/license-shipped.mjs report.json  (reads a saved `pnpm licenses` report)
//
// No `#!` line: the tests import this file, and on a Windows (CRLF) checkout a `#!` line
// makes that import a SyntaxError. Run it with `node`.

import { execFileSync } from 'node:child_process'
import console from 'node:console'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// SPDX ids plus common free-form spellings (`GPLv3`, `GPL v2`, `AGPL-3`)
const COPYLEFT = /^A?GPL(?:[- ]?v?[23](?:\.0)?)?(?:-only|-or-later|\+)?$/i

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
  const moduleCount = Object.values(report).reduce(
    (count, modules) => count + (Array.isArray(modules) ? modules.length : 0),
    0
  )
  if (!moduleCount) throw new Error('The licence report lists no modules; refusing to report clean')
  const failures = []
  const unknown = []
  for (const [license, modules] of Object.entries(report)) {
    const names = modules.map(module => `${module.name}@${module.versions?.join(',') ?? '?'}`)
    if (isCopyleftOnly(license)) failures.push({ license, names })
    else if (/^unknown$/i.test(license)) unknown.push({ license, names })
  }
  return { failures, unknown }
}

const workspaceLicenses = () =>
  JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  )

const main = () => {
  const reports = process.argv[2]
    ? [['report', JSON.parse(readFileSync(process.argv[2], 'utf8'))]]
    : [['workspace', workspaceLicenses()]]

  let failed = 0
  for (const [where, report] of reports) {
    const { failures, unknown } = classifyLicenses(report)
    for (const { license, names } of unknown)
      console.log(`::warning::${where}: licence not declared (${license}): ${names.join(', ')}`)
    for (const { license, names } of failures)
      console.log(`::error::${where}: copyleft licence ${license}: ${names.join(', ')}`)
    failed += failures.length
  }

  const modules = reports.reduce(
    (count, [, report]) => count + Object.values(report).reduce((n, list) => n + list.length, 0),
    0
  )
  console.log(`\nChecked ${modules} production module(s): ${failed} copyleft finding(s).`)
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

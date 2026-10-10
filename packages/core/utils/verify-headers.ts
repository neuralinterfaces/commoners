/**
 * Compare the headers a deployment actually serves with the ones the build declared
 * (`_headers`). Hosting layers drop or rewrite headers silently — e.g. serving every
 * security header except the CSP — so the declared policy is only real once checked here.
 */

import { readFileSync } from 'node:fs'

import { parseHeadersFile } from '../vite/plugins/web-security.js'

export type HeaderMismatch = { name: string; expected: string; actual: string }
export type HeaderCheck = { ok: boolean; missing: string[]; mismatched: HeaderMismatch[] }

export const compareHeaders = (
  declared: Record<string, string>,
  served: Record<string, string>
): HeaderCheck => {
  const servedLower = Object.fromEntries(
    Object.entries(served).map(([k, v]) => [k.toLowerCase(), v])
  )
  const missing: string[] = []
  const mismatched: HeaderMismatch[] = []

  for (const [name, expected] of Object.entries(declared)) {
    const actual = servedLower[name.toLowerCase()]
    if (actual === undefined) missing.push(name)
    else if (actual.trim() !== expected.trim()) mismatched.push({ name, expected, actual })
  }

  return { ok: !missing.length && !mismatched.length, missing, mismatched }
}

export const verifyHeaders = async (url: string, headersFile: string): Promise<HeaderCheck> => {
  const declared = parseHeadersFile(readFileSync(headersFile, 'utf8'))
  const response = await fetch(url, { redirect: 'follow' })
  const served: Record<string, string> = {}
  response.headers.forEach((value, key) => (served[key] = value))
  return compareHeaders(declared, served)
}

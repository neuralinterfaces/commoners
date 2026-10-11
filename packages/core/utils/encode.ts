import crypto from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname, relative, resolve, sep } from 'node:path'

/**
 * Generates a set of characters from the hash of an input string.
 * @param {string} input - The string to hash.
 * @param {number} length - The length of the string to generate.
 * @returns {string} - The generated string.
 */
export function encode(input: string, length: number) {
  const hash = crypto.createHash('sha256').update(input).digest('hex')

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    const index = parseInt(hash.slice(i * 2, i * 2 + 2), 16) % chars.length
    result += chars[index]
  }
  return result
}

// Names are fixed per build: every call site agrees on an input's name, even if the file is
// written partway through the build. BuildFlow resets this at the start of each build
const encoded = new Map<string, string>()
export const resetEncodedPaths = () => encoded.clear()

/**
 * Output file name for an input: `<basename>-<16 chars><ext>`. The suffix is derived from the
 * input's path relative to `base` (so it doesn't depend on where the project is checked out) and
 * from its contents when the file exists (so a changed file gets a new name and caches can't serve
 * the old one). The same inputs always give the same name: builds are reproducible.
 */
export const encodePath = (input: string, base?: string) => {
  const absolute = resolve(input)
  // Keyed by the input alone: callers may pass differently-formed output directories, and every
  // one of them must get the same name for the same file within a build
  const known = encoded.get(absolute)
  if (known) return known

  const location = base
    ? relative(resolve(base), absolute).split(sep).join('/')
    : basename(absolute)
  let contents = ''
  try {
    if (statSync(absolute).isFile())
      contents = crypto.createHash('sha256').update(readFileSync(absolute)).digest('hex')
  } catch {
    // Not written yet: the name comes from the path alone
  }

  const ext = extname(absolute)
  const name = `${basename(absolute, ext)}-${encode(`${location}\0${contents}`, 16)}${ext}`
  encoded.set(absolute, name)
  return name
}

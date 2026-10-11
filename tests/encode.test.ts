import { describe, test, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { encodePath, resetEncodedPaths } from '../packages/core/utils/encode'

// A project with src/icon.png and an output directory, checked out at a fresh location
const project = (iconContents = 'png') => {
  const root = mkdtempSync(join(tmpdir(), 'commoners-encode-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'icon.png'), iconContents)
  return { icon: join(root, 'src', 'icon.png'), outDir: join(root, '.commoners', 'web') }
}

describe('encodePath', () => {
  beforeEach(() => resetEncodedPaths())

  test('keeps the base name and extension', () => {
    const { icon, outDir } = project()
    expect(encodePath(icon, outDir)).toMatch(/^icon-[A-Za-z0-9]{16}\.png$/)
  })

  test('the same project gives the same name in every build, wherever it is checked out', () => {
    const a = project()
    const first = encodePath(a.icon, a.outDir)
    resetEncodedPaths()
    expect(encodePath(a.icon, a.outDir)).toBe(first)
    const b = project() // Same layout and contents, different directory
    expect(encodePath(b.icon, b.outDir)).toBe(first)
  })

  test('changed contents give a new name, so caches cannot serve the old file', () => {
    const a = project('png-v1')
    const b = project('png-v2')
    expect(encodePath(a.icon, a.outDir)).not.toBe(encodePath(b.icon, b.outDir))
  })

  test('within a build, an input keeps its first name even if the file changes later', () => {
    const { icon, outDir } = project('before')
    const first = encodePath(icon, outDir)
    writeFileSync(icon, 'after')
    expect(encodePath(icon, outDir)).toBe(first)
  })

  test('a file not written yet is named from its path alone', () => {
    const { outDir } = project()
    const missing = join(outDir, '..', '..', 'src', 'later.js')
    expect(encodePath(missing, outDir)).toMatch(/^later-[A-Za-z0-9]{16}\.js$/)
  })

  test('a file not written yet is renamed when the build salt changes, stable when it does not', () => {
    const { outDir } = project()
    const missing = join(outDir, 'commoners.config.mjs')
    resetEncodedPaths('config-v1')
    const first = encodePath(missing, outDir)
    resetEncodedPaths('config-v1')
    expect(encodePath(missing, outDir)).toBe(first)
    resetEncodedPaths('config-v2')
    expect(encodePath(missing, outDir)).not.toBe(first)
  })
})

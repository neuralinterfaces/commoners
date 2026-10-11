import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A project created with create-commoners must build for every target its scripts offer,
// without the user changing anything first

const template = join(__dirname, '..', 'packages', 'create-commoners', 'template')
const pkg = JSON.parse(readFileSync(join(template, 'package.json'), 'utf8'))

// PNG width and height live in the IHDR chunk at bytes 16–23
const pngSize = (file: string) => {
  const data = readFileSync(file)
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

describe('create-commoners template', () => {
  test('the icon meets the desktop minimum (512×512)', () => {
    const { width, height } = pngSize(join(template, 'icon.png'))
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(512)
  })

  test('declares the toolchain its build scripts need', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(pkg.scripts)).toContain('build:desktop')
    expect(all.electron, 'electron for build:desktop').toBeDefined()
    expect(all['electron-builder'], 'electron-builder for build:desktop').toBeDefined()
    for (const name of ['@capacitor/cli', '@capacitor/core']) expect(all[name], name).toBeDefined()
  })
})

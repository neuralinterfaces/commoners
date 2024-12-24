import { expect } from 'vitest'
import { globalTempDir } from '@commoners/solidarity'

import { join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
  

export const checkAssets = (projectBase, baseDir = '', { build = false, target = 'web' } = {}) => {

  if (!baseDir) baseDir = join(projectBase, globalTempDir)


  const assetDir = join(baseDir, 'assets')

  //---------------------- Vite ----------------------
  expect(existsSync(assetDir)).toBe(true)

  // ---------------------- Common ----------------------
  const regexFindFile = (dir, regex) => readdirSync(dir).find(file => regex.test(file))


  // Transformed paths
  expect(regexFindFile(assetDir, /commoners.config-(.*).mjs/)).toBeTruthy()
  expect(regexFindFile(assetDir, /onload-(.*).mjs/)).toBeTruthy()
  expect(regexFindFile(assetDir, /icon-(.*).png/)).toBeTruthy()

  // Absolute paths
  expect(existsSync(join(assetDir, 'commoners.config.cjs'))).toBe(true)
  
  // ---------------------- Electron ----------------------
  const isElectron = target === 'electron'
  expect(existsSync(join(baseDir, 'main.cjs'))).toBe(isElectron)
  expect(existsSync(join(baseDir, 'preload.cjs'))).toBe(isElectron)

  // ---------------------- PWA ----------------------
  const isPWA = target === 'pwa'
  expect(existsSync(join(baseDir, 'manifest.webmanifest'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'registerSW.js'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'sw.js'))).toBe(isPWA)

}
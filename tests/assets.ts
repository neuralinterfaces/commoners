import { expect } from 'vitest'
import { globalTempDir } from '@commoners/solidarity'

import { join } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
  

const getPackagedServiceName = (name) => (process.platform === 'win32') ? `${name}.exe` : name

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
  expect(existsSync(join(baseDir, 'package.json'))).toBe(true) // Auto-generated package.json
  
  // ---------------------- Electron ----------------------
  const isElectron = target === 'electron'
  expect(existsSync(join(baseDir, 'main.js'))).toBe(isElectron)
  expect(existsSync(join(baseDir, 'preload.js'))).toBe(isElectron)

  // // --------------- NOTE: Write a more comprehensive script to check service assets programmatically ---------------
  // // --------------- We know where we want them located based on their declaration... ---------------
  // const buildDir = join(baseDir, '..', '..', '..', 'build')
  // const servicesDir = join(baseDir, '..', '..', 'services')
  // // const manualServiceDir = join(buildDir, 'manual')

  // if (build) {
  //   const services = [ 'http', 'express' ]

  //   services.forEach(name => {
  //     const location = join(servicesDir, name, getPackagedServiceName(name))
  //     expect(existsSync(location)).toBe(isElectron)
  //   })

  //   // expect(existsSync(join(manualServiceDir, getPackagedServiceName('manual')))).toBe(isElectron)
  
  //   // const txtFile = join(manualServiceDir, 'test.txt')
  //   // expect(existsSync(txtFile)).toBe(isElectron)
  //   // if (isElectron) expect(readFileSync(txtFile, 'utf-8')).toBe('Hello world!')
  // }

  // // NOTE: Implement checks for intermediate TS builds
  // else {

  // }
  
  // ---------------------- PWA ----------------------
  const isPWA = target === 'pwa'
  expect(existsSync(join(baseDir, 'manifest.webmanifest'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'registerSW.js'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'sw.js'))).toBe(isPWA)

}
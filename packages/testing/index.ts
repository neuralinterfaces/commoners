
import { afterAll, beforeAll, expect } from 'vitest'
import {
    build,
    loadConfigFromFile,
    start,
    share,
    templateDir,
    globalTempDir
  } from '../core/index'

import { join, sep, relative } from 'node:path'
import { rmSync, existsSync } from 'node:fs'
  

export const sharePort = 1234

const startProject = (projectBase, customProps = {}) => {

    let manager;
    beforeAll(async () => {
        const config = await loadConfigFromFile(projectBase)
        manager = await start({
        ...config,
        ...customProps
        })
    })

    afterAll(() => {
        if (manager) manager.close({
            services: true,
            frontend: true
        })
    })

  }


  const buildProject = async (projectBase, { target, outDir }) => {

    beforeAll(async () => {
        const config = await loadConfigFromFile(projectBase)
        await build({
          ...config,
          target,
          build: {
            outDir: join(...relative(process.cwd(), projectBase).split(sep).map(() => '..'), outDir) // Escape to the project base
          }
        })
      })
  
      afterAll(async () => {
        rmSync(outDir, { recursive: true })
      })
}  

const shareProject = (projectBase, additionalProps = {}) => {

  let manager;
  beforeAll(async () => {
      const config = await loadConfigFromFile(projectBase)
      config.share = { port: sharePort, ...additionalProps } // Specify share port
      manager = await share(config)
  })

  afterAll(() => {
      if (manager) manager.close()
  })

}

  

export {
    startProject as start,
    buildProject as build,
    shareProject as share
}

export const checkAssets = (projectBase, baseDir = '', { build = false, target = 'web' } = {}) => {

  if (!baseDir) baseDir = join(projectBase, globalTempDir)

  // Vite Assets Directory (NOT THERE?)
  expect(existsSync(join(baseDir, 'assets'))).toBe(build)

  // Common Commoners Assets
  expect(existsSync(join(baseDir, 'commoners.config.mjs'))).toBe(true)
  expect(existsSync(join(baseDir, 'commoners.config.cjs'))).toBe(true)
  expect(existsSync(join(baseDir, 'onload.mjs'))).toBe(true)
  expect(existsSync(join(baseDir, 'package.json'))).toBe(true) // Auto-generated package.json
  expect(existsSync(join(baseDir, templateDir, 'icon.png'))).toBe(true) // Template icon

  // Electron Assets
  const isElectron = target === 'electron'
  expect(existsSync(join(baseDir, 'main.js'))).toBe(isElectron)
  expect(existsSync(join(baseDir, 'preload.js'))).toBe(isElectron)
  expect(existsSync(join(baseDir, 'splash.html'))).toBe(isElectron)
  expect(existsSync(join(baseDir, '.env'))).toBe(isElectron)
  
  // PWA Commoners Assets
  const isPWA = target === 'pwa'
  expect(existsSync(join(baseDir, 'manifest.webmanifest'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'registerSW.js'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'sw.js'))).toBe(isPWA)

  if (isPWA) {
    // Find workbox-9314ba86.js dynamically
  }

}
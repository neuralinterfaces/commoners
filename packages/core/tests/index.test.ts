// sum.test.js
import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
  build,
    globalTempDir,
    launch,
    loadConfigFromFile,
    resolveConfigPath,
    start,
    templateDir,
} from '../index'

import { name } from './app/commoners.config'
import { join, resolve } from 'path'
import { existsSync, rmSync } from 'fs'

const projectBase = 'app'

const tempOutDir = join(projectBase, globalTempDir)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

describe('Custom project base is loaded', () => {

  test('Config is resolved', () => {
    const configPath = resolveConfigPath(projectBase)
    expect(configPath).toBe(resolve(projectBase, 'commoners.config.ts'))
  })

  test('Config is loaded', async () => {
    const config = await loadConfigFromFile(projectBase)
    expect(config.name).toBe(name)
  })
})

const cleanupProject = (manager) => {

  manager.close({
    services: true,
    frontend: true
  })
}

const startProject = async (customProperties = {}) => {
  const config = await loadConfigFromFile(projectBase)
  return await start({
    ...config,
    ...customProperties
  })
}

const checkBaseAssets = (baseDir = tempOutDir) => {
  
  expect(existsSync(join(baseDir, 'commoners.config.mjs'))).toBe(true)
  expect(existsSync(join(baseDir, 'commoners.config.cjs'))).toBe(true)
  expect(existsSync(join(baseDir, 'onload.mjs'))).toBe(true)
  expect(existsSync(join(baseDir, 'package.json'))).toBe(true) // Auto-generated package.json
  expect(existsSync(join(baseDir, templateDir, 'icon.png'))).toBe(true) // Template icon
}

describe('Start Application', () => {

  describe('Web', () => {


    let manager;
    beforeAll(async () => {
      manager = await startProject()
    })

    afterAll(() => {
      cleanupProject(manager)
    })
      
    test('All assets are generated', () => {
        checkBaseAssets()
    })

  })

  // NOTE: Skipped because I can't close the Electron instance programmatically
  describe.skip('Desktop', async () => {

    let manager;
    beforeAll(async () => {
      manager = await startProject({ target: 'desktop' })
    })

    afterAll(async () => {
      cleanupProject(manager)
    })

    test('All assets are generated', () => {
        checkBaseAssets()
        expect(existsSync(join(tempOutDir, 'main.js'))).toBe(true)
        expect(existsSync(join(tempOutDir, 'preload.js'))).toBe(true)
    })

  })

  // NOTE: Skipped because Ruby Gems needs to be updated
  describe.skip('Mobile', () => {

    let manager;
    beforeAll(async () => {
      manager = await startProject({ target: 'mobile' })
    })

    afterAll(() => {
      cleanupProject(manager)
    })

    test('All assets are generated', () => {
        checkBaseAssets()
    })

  })
})

describe.skip('Share Application Services', () => {

})


describe('Build Application', () => {

  const outDir = '.site'

  describe('Web', () => {
    const target = 'web'

    beforeAll(async () => {
      const config = await loadConfigFromFile(projectBase)
      await build({
        ...config,
        target,
        build: {
          outDir: join('..', outDir) // Escape from the project base
        }
      })
    })

    afterAll(async () => {
      rmSync(outDir, { recursive: true })
    })

    test('All assets are found', async () => {
      checkBaseAssets(outDir)
    })

    test('Can be launched', async () => {
      const result = await launch({ target, outDir })
      const res = await fetch(result.url as string)
      const text = await res.text()
      text.includes('Hello World')
      expect(text.includes('Hello World!')).toBe(true)
      expect(res.status).toBe(200)
    })
  })

  // NOTE: Incomplete
  describe.skip('Desktop', () => {
    const target = 'desktop'

    test('Can be launched', () => {
      launch({ target, outDir })
    })
    
  })

  // NOTE: Incomplete
  describe.skip('Mobile', () => {
    const target = 'mobile'

    test('Can be launched', () => {
      launch({ target, outDir })
    })
    
  })

})



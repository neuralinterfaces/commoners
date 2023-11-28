
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
    build,
    loadConfigFromFile,
    start,
    share,
    templateDir,
    globalTempDir,
    electronDebugPort,
    launch,
    UserConfig,
    LaunchOptions
  } from '../core/index'

import { join, sep, relative } from 'node:path'
import { rmSync, existsSync } from 'node:fs'
  
import * as puppeteer from 'puppeteer'
import { sleep } from '../core/tests/utils'

export const sharePort = 1234

type Output = {
  manager?: {
    close: Function
  }
}

const beforeStart = async (projectBase, customProps) => {
  const config = await loadConfigFromFile(projectBase)
  return await start({
  ...config,
  ...customProps
  })
}

const afterStart = (manager: Output['manager']) => {
  if (manager) manager.close({
    services: true,
    frontend: true
  })
}

const startProject = (projectBase, customProps = {}) => {

    const output: Output = {};
    beforeAll(async () => {
      output.manager = await beforeStart(projectBase, customProps)
    })

    afterAll(() => {
      afterStart(output.manager)
    })

    return output

  }


  const buildProject = async (projectBase, { target, outDir }) => {

    beforeAll(async () => {

        // NOTE: Should the root be automatically updating the build.outDir property?
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


type BrowserTestOutput = {
  info?: any
  page?: puppeteer.Page,
  browser?: puppeteer.Browser
}

export const startBrowserTest = (customProps: Partial<UserConfig> = {}, projectBase?: string) => {


  let resolveOutput;
  const output: BrowserTestOutput = {}

  const toLaunch = 'launch' in customProps

  const target = toLaunch ? customProps?.launch?.target : customProps.target

  beforeAll(async () => {

    const result = output.info = await (toLaunch ? launch(customProps.launch as LaunchOptions) : beforeStart(projectBase, customProps))

    // if (toLaunch) await sleep(500) // Ensure server finishes opening

    const url = result.url

      // Launched Electron Instance
      if (target === 'electron') {

        // mainWindow.webContents.on("did-finish-load", () => { 
        const response = await fetch(`http://localhost:${electronDebugPort}/json/versions/list?t=${Math.random()}`)
        const debugEndpoints = await response.json()

        let webSocketDebuggerUrl = debugEndpoints['webSocketDebuggerUrl ']

        const browser = output.browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl })

        const [ page ] = await browser.pages();
        output.page = page
      } 
      
      // Non-Electron Instance
      else {
          const browser = output.browser = await puppeteer.launch({ headless: 'new' })
          const page = output.page = await browser.newPage();
          await page.goto(url);
          output.page = page
      }
  })

  afterAll(async () => {
    if (output.browser) await output.browser.close()
    if (output.info.server) output.info.server.close()
    // if (output.page) await output.page.close()
    if (!toLaunch) afterStart(output.info)
  });

  return output

}

const shareProject = (projectBase, additionalProps = {}) => {

  const output: Output = {};
  beforeAll(async () => {
      const config = await loadConfigFromFile(projectBase)
      config.share = { port: sharePort, ...additionalProps } // Specify share port
      output.manager = await share(config)
  })

  afterAll(() => {
      if (output.manager) output.manager.close()
  })

  return output

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

}
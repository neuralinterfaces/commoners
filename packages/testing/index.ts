
import { afterAll, beforeAll, expect, vi } from 'vitest'
import {
    build,
    loadConfigFromFile,
    start,
    share,
    globalTempDir,
    globalWorkspacePath,
    electronDebugPort,
    launch,
    UserConfig,
    LaunchOptions,
    CommonersGlobalObject,
  } from '../core/index'

import { join } from 'node:path'
import { rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
  
import * as puppeteer from 'puppeteer'
import { sleep } from '../core/tests/utils'

export const sharePort = 1234
export const scopedBuildOutDir = '.site'

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


  const buildProject = async (projectBase, { target, outDir }, hooks = {}) => {

    const globalWorkspace = join(projectBase, globalWorkspacePath)
    const customBuildDir = join(projectBase, 'build')
    const customOutDir = join(projectBase, scopedBuildOutDir)
    

    const toClear = [
      outDir,
      globalWorkspace, // Includes services and temporary files
      customBuildDir,
      customOutDir
    ]

    const isElectron = target === 'electron'
    const isMobile = target === 'mobile'

  const waitTime = (isElectron || isMobile) ? 1 * 60 * 1000 : undefined // Wait a minute for Electron services to build

    beforeAll(async () => {
        const config = await loadConfigFromFile(projectBase)
        await build({
          ...config,
          target,
          build: {
            outDir
          }
        }, hooks)

      }, waitTime)
  
      afterAll(async () => {
        toClear.forEach(path => {
          if (existsSync(path)) rmSync(path, { recursive: true })
        })
      })
}  


type BrowserTestOutput = {
  info?: any
  page?: puppeteer.Page,
  browser?: puppeteer.Browser,
  commoners?: CommonersGlobalObject
}

export const startBrowserTest = (customProps: Partial<UserConfig> = {}, projectBase?: string) => {


  const output: BrowserTestOutput = {}

  const toLaunch = 'launch' in customProps

  const target = toLaunch ? customProps?.launch?.target : customProps.target

  const isElectron = target === 'electron'

  beforeAll(async () => {

      const result = output.info = await (toLaunch ? launch(customProps.launch as LaunchOptions) : beforeStart(projectBase, customProps))

      // if (toLaunch) await sleep(500) // Ensure server finishes opening

      const url = result.url

      const browser = output.browser = await puppeteer.launch({ headless: 'new' })
      const page = output.page = await browser.newPage();


      // Launched Electron Instance
      if (isElectron) {

        // Ensure Electron will exit gracefully
        const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
          mockExit.mockRestore()
        });


        await sleep(5 * 1000) // Wait for five seconds for Electron to open

        const browserURL = `http://localhost:${electronDebugPort}`
        await page.goto(browserURL);
        const endpoint = await page.evaluate(() => fetch(`json/version`).then(res => res.json()).then(res => res.webSocketDebuggerUrl))
        await browser.close()

        // Connect to browser WS Endpoint
        const browserWSEndpoint = endpoint.replace('localhost', '0.0.0.0')
        output.browser = await puppeteer.connect({ browserWSEndpoint, defaultViewport: null  })
        const pages = await output.browser.pages()
        output.page = pages[0]
      } 
      
      // Non-Electron Instance
      else {
          await page.goto(url);
      }

      output.commoners = await output.page.evaluate(() => commoners.READY.then(() => commoners))

  })

  afterAll(async () => {
    if (output.browser) await output.browser.close() // Will also exit the Electron instance

    // Start successful
    if (output.info) {
      if (output.info.server) output.info.server.close()
      if (!toLaunch) afterStart(output.info)
    }

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
  expect(existsSync(join(assetDir, 'splash.html'))).toBe(isElectron)

 const envExpectation = expect(regexFindFile(assetDir, /.env-(.*)/))
 if (isElectron) envExpectation.toBeTruthy()
 else envExpectation.toBeFalsy()

 const buildDir = join(baseDir, '..', '..', '..', 'build')
  const servicesDir = join(baseDir, '..', '..', 'services')
  const manualServiceDir = join(buildDir, 'manual')

  // Service
  expect(existsSync(join(servicesDir, 'http', getPackagedServiceName('http')))).toBe(isElectron)
  expect(existsSync(join(servicesDir, 'express', getPackagedServiceName('express')))).toBe(isElectron)

  // Custom service with extra assets
  expect(existsSync(join(manualServiceDir, getPackagedServiceName('manual')))).toBe(isElectron)
  
  const txtFile = join(manualServiceDir, 'test.txt')

  expect(existsSync(txtFile)).toBe(isElectron)

  if (isElectron && build) expect(readFileSync(txtFile, 'utf-8')).toBe('Hello world!')

  
  // ---------------------- PWA ----------------------
  const isPWA = target === 'pwa'
  expect(existsSync(join(baseDir, 'manifest.webmanifest'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'registerSW.js'))).toBe(isPWA)
  expect(existsSync(join(baseDir, 'sw.js'))).toBe(isPWA)

}
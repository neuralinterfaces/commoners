
import {
  loadConfigFromFile,
  start as CommonersStart,
  launch as CommonersLaunch,
  build as CommonersBuild,
  globalWorkspacePath,
  electronDebugPort,
  UserConfig,
  BuildHooks,
  cleanup
} from '@commoners/solidarity'
// } from '../core/index'

import { join } from 'node:path'
import { rmSync, existsSync } from 'node:fs'

import * as puppeteer from 'puppeteer'
import merge from '../core/utils/merge'

const getOutDir = (config) => config.launch?.outDir || config.build?.outDir || config.outDir

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

type Output = {
  cleanup: Function
}

// NOTE: You'll likely have to wait longer for Electron to build
export const build = async (
  root, 
  overrides: Partial<UserConfig> = {},
  hooks: BuildHooks = {}
) => {

  const config = await loadConfigFromFile(root)
  const updatedConfig = merge(config, overrides)

  const { outDir } = updatedConfig.build || {}


  const AUTOCLEAR = [
    outDir,
    join(root, globalWorkspacePath), // All default commoners outputs, including services and temporary files
  ]
  
  await CommonersBuild(updatedConfig, hooks)

  return {
    cleanup: async (relativePathsToRemove = []) => {
      const toRemove = [...AUTOCLEAR, ...relativePathsToRemove.map(path => join(root, path))]
      toRemove.forEach(path => existsSync(path) ? rmSync(path, { recursive: true }) : '')
      cleanup() // Cleanup after the build process
    }
  }
}

type BrowserTestOutput = {

  page: puppeteer.Page,
  browser: puppeteer.Browser,

  toSpyOn: { object: any, method: string }[],

  url: string,
  server?: any

} & Output

export const open = async (
  root?: string,
  overrides: Partial<UserConfig> = {}, 
  useBuild = false
) => {

  const states: Partial<BrowserTestOutput> = {}

  const config = await loadConfigFromFile(root)
  const updatedConfig = merge(config, overrides)

  const isElectron = updatedConfig.target === 'electron'

  // Launch build of the project
  if (useBuild) {
    
    const launchResults = await CommonersLaunch({
      root,
      target: updatedConfig.target,
      outDir: getOutDir(updatedConfig),
      port: updatedConfig.port
    })

    Object.assign(states, launchResults)
  }


  // Start development server for the project
  else {
    const { url, close: cleanup } = await CommonersStart(updatedConfig)
    Object.assign(states, { url, cleanup })
  }
  
  const browser = states.browser = await puppeteer.launch()
  // const browser = output.browser = await puppeteer.launch({ headless: false })

  const page = states.page = await browser.newPage();

  // Launched Electron Instance
  if (isElectron) {

    await sleep(5 * 1000) // Wait for five seconds for Electron to open

    const browserURL = `http://localhost:${electronDebugPort}`
    await page.goto(browserURL);
    const endpoint = await page.evaluate(() => fetch(`json/version`).then(res => res.json()).then(res => res.webSocketDebuggerUrl))
    await browser.close()

    // Connect to browser WS Endpoint
    const browserWSEndpoint = endpoint.replace('localhost', '0.0.0.0')
    states.browser = await puppeteer.connect({ browserWSEndpoint, defaultViewport: null })
    const pages = await states.browser.pages()
    states.page = pages[0]
  }

  // Non-Electron Instance
  else await page.goto(states.url);

  return {
    ...states,
    toSpyOn: [
      { object: process, method: 'exit' } // Ensure Electron will exit gracefully
    ],

    // Override cleanup function
    cleanup: async () => {
      
      cleanup() // Cleanup the command

      if (states.browser) await states.browser.close() // Will also exit the Electron instance
      if (states.server) states.server.close()
    }

  } as BrowserTestOutput

  // output.toSpyOn.forEach(({ object, method }) => {  
  //   const mockExit = vi.spyOn(object, method).mockImplementation(() => {
  //     mockExit.mockRestore()
  //   });
  // })
}

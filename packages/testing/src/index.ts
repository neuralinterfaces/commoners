
import {
  loadConfigFromFile,
  start as CommonersStart,
  launch as CommonersLaunch,
  build as CommonersBuild,
  globalWorkspacePath,
  UserConfig,
  BuildHooks,
  cleanup,
  merge
} from '@commoners/solidarity'
// } from '../core/index'

import { join } from 'node:path'
import { rmSync, existsSync } from 'node:fs'

import { chromium, Page, Browser } from 'playwright'

const getOutDir = (config) => config.launch?.outDir || config.build?.outDir || config.outDir

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

type Output = {
  cleanup: Function
}

const onTestFunction = () => {
  process.env["COMMONERS_TESTING"] = true
}

// NOTE: You'll likely have to wait longer for Electron to build
export const build = async (
  root, 
  overrides: Partial<UserConfig> = {},
  hooks: BuildHooks = {}
) => {

  onTestFunction()


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

  page: Page,
  browser: Browser,

  toSpyOn: { object: any, method: string }[],

  url: string,
  server?: any

} & Output

export const open = async (
  root?: string,
  overrides: Partial<UserConfig> = {}, 
  useBuild = false
) => {

  onTestFunction()

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
  
  // Launched Electron Instance
  if (isElectron) {

    const testingPlugin = Object.values(config.plugins).find(p => p.options && "remoteDebuggingPort" in p.options)
    if (!testingPlugin) throw Error("Must use the @commoners/testing/plugin to enable remote debugging of the Electron application")

    await sleep(5 * 1000) // Wait for five seconds for Electron to open
    const browser = states.browser = await chromium.connectOverCDP(`http://localhost:${testingPlugin.options.remoteDebuggingPort}`);
    const defaultContext = browser.contexts()[0];
    states.page = defaultContext.pages()[0];
  }

  // Non-Electron Instance
  else {
    const browser = states.browser = await chromium.launch()
    // const browser = output.browser = await chromium.launch({ headless: false })
    const page = states.page = await browser.newPage();  
    await page.goto(states.url);
  }

  return {
    ...states,
    toSpyOn: [
      { object: process, method: 'exit' } // Ensure Electron will exit gracefully
    ],

    // Override cleanup function
    cleanup: async () => {
      
      cleanup() // Cleanup the command

      // Close launched Electron build
      if (isElectron) {
        await states.page.evaluate(() => {
          const { commoners } = globalThis
          return commoners.READY.then(() => commoners.DESKTOP.quit())
        })
      }

      // Close all active windows
      if (states.browser) await states.browser.close()
      if (states.server) states.server.close()
    }

  } as BrowserTestOutput

}

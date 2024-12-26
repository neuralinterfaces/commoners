
import {
  loadConfigFromFile,
  start as CommonersStart,
  launch as CommonersLaunch,
  build as CommonersBuild,
  buildServices as CommonersBuildServices,
  globalWorkspacePath,
  UserConfig,
  BuildHooks,
  cleanup,
  merge
} from '@commoners/solidarity'
// } from '../core/index'

import { removeDirectory } from '../../core/utils/files.js'

import { join } from 'node:path'

import { chromium, Page, Browser } from 'playwright'
import { ServiceBuildOptions } from '../../core/types.js'

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

  const { outDir } = updatedConfig || {}

  const AUTOCLEAR = [
    outDir,
    join(root, globalWorkspacePath), // All default commoners outputs, including services and temporary files
  ]
  
  await CommonersBuild(updatedConfig, hooks)

  return {
    cleanup: async (relativePathsToRemove = []) => {
      const toRemove = [...AUTOCLEAR, ...relativePathsToRemove.map(path => join(root, path))]
      toRemove.forEach(path => removeDirectory(path))
      cleanup() // Cleanup after the build process
    }
  }
}

export const buildServices = async (
  root, 
  options: ServiceBuildOptions = {}
) => {

  onTestFunction()

  const config = await loadConfigFromFile(root)

  const { outDir } = config

  const AUTOCLEAR = [
    outDir,
    join(root, globalWorkspacePath), // All default commoners outputs, including services and temporary files
  ]
  
  await CommonersBuildServices(config, options)

  return {
    cleanup: async (relativePathsToRemove = []) => {
      const toRemove = [...AUTOCLEAR, ...relativePathsToRemove.map(path => join(root, path))]
      toRemove.forEach(path => removeDirectory(path))
      cleanup() // Cleanup after the build process
    }
  }
}

type BrowserTestOutput = {

  page: Page,
  browser: Browser,
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

  const { outDir, target, port } = updatedConfig

  const isElectron = target === 'electron'

  // Launch build of the project
  if (useBuild) {
    
    const launchResults = await CommonersLaunch({
      root,
      target,
      outDir,
      port
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

    await sleep(5 * 1000) // Wait for five seconds for Electron to open (and close splash screen)
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

    // Override cleanup function
    cleanup: async () => {
      
      cleanup() // Cleanup the command

      // Close Electron instances
      if (isElectron) {
        await states.page.evaluate(() => {
          const { commoners } = globalThis
          return commoners.READY.then(() => commoners.DESKTOP.quit())
        })
      }

      // Close Playwright browsers
      if (states.browser) await states.browser.close()

      // Close active servers
      if (states.server) states.server.close()
    }

  } as BrowserTestOutput

}

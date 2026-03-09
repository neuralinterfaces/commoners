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
  merge,
  isDesktop,
} from '@commoners/solidarity'
// } from '../core/index'

import { removeDirectory } from '../../core/utils/files.js'

import { join } from 'node:path'

import { chromium, Page, Browser } from 'playwright'
import { ServiceBuildOptions } from '../../core/types.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

type Output = {
  cleanup: Function
}

const onTestFunction = () => (process.env['__COMMONERS_TESTING'] = 'true') // Set the testing environment variable

// NOTE: You'll likely have to wait longer for Electron to build
export const build = async (root, overrides: Partial<UserConfig> = {}, hooks: BuildHooks = {}) => {
  onTestFunction()

  const config = await loadConfigFromFile(root)
  const updatedConfig = merge(config, overrides)

  const { outDir } = updatedConfig || {}

  const AUTOCLEAR = [
    outDir,
    join(root, globalWorkspacePath), // All default commoners outputs, including services and temporary files
  ]

  const buildMetadata = await CommonersBuild(updatedConfig, hooks)

  return {
    metadata: buildMetadata,
    cleanup: async (relativePathsToRemove = []) => {
      const toRemove = [...AUTOCLEAR, ...relativePathsToRemove.map(path => join(root, path))]
      toRemove.forEach(path => removeDirectory(path))
      await cleanup() // Cleanup after the build process
    },
  }
}

export const buildServices = async (root, options: ServiceBuildOptions = {}) => {
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
      await cleanup() // Cleanup after the build process
    },
  }
}

type BrowserTestOutput = {
  page: Page
  browser: Browser
  url: string
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

  const isElectron = isDesktop(target)

  // Set remote debugging port env var before spawning Electron
  // This is read by electron.ts startup() and passed as a CLI arg to the Electron process
  if (isElectron) {
    const testingPlugin = Object.values(config.plugins).find(
      p => p.options && 'remoteDebuggingPort' in p.options
    )
    if (!testingPlugin)
      throw Error(
        'Must use the @commoners/testing/plugin to enable remote debugging of the Electron application'
      )
    process.env.COMMONERS_REMOTE_DEBUGGING_PORT = `${testingPlugin.options.remoteDebuggingPort}`
  }

  // Launch build of the project
  if (useBuild) {
    const launchResults = await CommonersLaunch({
      root,
      target,
      outDir,
      port,
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
    const cdpPort = process.env.COMMONERS_REMOTE_DEBUGGING_PORT
    const cdpUrl = `http://localhost:${cdpPort}`

    // Retry CDP connection — Electron needs time to start and initialize
    // the remote debugging server. Poll until the CDP endpoint responds.
    const cdpTimeout = 30_000
    const start = Date.now()
    let browser: Browser | null = null
    let delay = 500
    while (Date.now() - start < cdpTimeout) {
      try {
        browser = await chromium.connectOverCDP(cdpUrl)
        break
      } catch {
        await sleep(delay)
        delay = Math.min(delay * 1.5, 3000)
      }
    }

    if (!browser) throw new Error(`CDP connection to Electron timed out after ${cdpTimeout}ms (${cdpUrl})`)

    states.browser = browser
    const defaultContext = browser.contexts()[0]

    // Find the main application page (not the splash screen).
    // The splash screen plugin creates a temporary BrowserWindow that appears as
    // a CDP page. We need the page that has the commoners global loaded.
    const pageTimeout = 30_000
    const pageStart = Date.now()
    let lastPageCount = -1
    while (Date.now() - pageStart < pageTimeout) {
      const pages = defaultContext.pages()
      if (pages.length !== lastPageCount) {
        console.log(`[CDP] Found ${pages.length} page(s) at ${((Date.now() - pageStart) / 1000).toFixed(1)}s`)
        for (const p of pages) {
          try { console.log(`  - ${p.url()}`) } catch {}
        }
        lastPageCount = pages.length
      }
      for (const p of pages) {
        try {
          const hasCommoners = await p.evaluate(() => typeof globalThis.commoners !== 'undefined')
          if (hasCommoners) {
            states.page = p
            break
          }
        } catch {} // Page may be closed (e.g., splash screen) or not ready
      }
      if (states.page) break
      await sleep(500)
    }

    if (!states.page) {
      const pages = defaultContext.pages()
      console.error(`[CDP] Page finding timed out. ${pages.length} page(s) available:`)
      for (const p of pages) {
        try { console.error(`  - ${p.url()}`) } catch {}
      }
      throw new Error('Could not find main application page with commoners global')
    }

    // Page recovery: when Chromium subprocesses crash, the CDP page can close.
    // Track this and attempt to re-find the page from the browser context.
    const testStart = Date.now()
    const elapsed = () => `${((Date.now() - testStart) / 1000).toFixed(1)}s`
    let pageNeedsRecovery = false

    const findPage = async () => {
      try {
        const pages = defaultContext.pages()
        for (const p of pages) {
          try {
            const hasCommoners = await p.evaluate(() => typeof globalThis.commoners !== 'undefined')
            if (hasCommoners) return p
          } catch {}
        }
      } catch {}
      return null
    }

    states.page.on('close', () => {
      console.warn(`[CDP] Page closed at ${elapsed()}`)
      pageNeedsRecovery = true
    })
    states.page.on('crash', () => {
      console.warn(`[CDP] Page crashed at ${elapsed()}`)
      pageNeedsRecovery = true
    })
    browser.on('disconnected', () => console.warn(`[CDP] Browser disconnected at ${elapsed()}`))

    // Wrap the page in a proxy that auto-recovers on stale page references
    const createRecoverablePageProxy = (page: Page): Page => {
      return new Proxy(page, {
        get(target, prop, receiver) {
          if (prop === 'evaluate' || prop === 'evaluateHandle' || prop === '$eval' || prop === '$$eval') {
            return async (...args: any[]) => {
              if (pageNeedsRecovery) {
                console.log(`[CDP] Attempting page recovery at ${elapsed()}...`)
                const newPage = await findPage()
                if (newPage) {
                  console.log(`[CDP] Page recovered at ${elapsed()}`)
                  states.page = createRecoverablePageProxy(newPage)
                  pageNeedsRecovery = false
                  newPage.on('close', () => {
                    console.warn(`[CDP] Recovered page closed at ${elapsed()}`)
                    pageNeedsRecovery = true
                  })
                  return (newPage as any)[prop](...args)
                }
                console.warn(`[CDP] Page recovery failed at ${elapsed()}`)
              }
              return (target as any)[prop](...args)
            }
          }
          return Reflect.get(target, prop, receiver)
        },
      }) as Page
    }

    states.page = createRecoverablePageProxy(states.page)
  }

  // Non-Electron Instance
  else {
    const browser = (states.browser = await chromium.launch({ headless: true }))
    const page = (states.page = await browser.newPage())
    await page.goto(states.url)
  }

  const result = {
    ...states,

    // Override cleanup function
    cleanup: async () => {
      // Fully close the Electron instance
      if (isElectron && states.page) {
        try {
          await states.page.evaluate(() => {
            const { commoners } = globalThis
            return commoners && commoners.READY.then(() => commoners.DESKTOP.quit())
          })
        } catch {
          // Page evaluate failed (e.g., CDP connection never established)
          // Solidarity cleanup below will kill the Electron process via registered handlers
        }
      }

      // Close the start manager (Vite server, services, filesystem)
      if (states.cleanup) await states.cleanup()

      // Run solidarity cleanup chain (kills Electron process tree via onCleanup handlers)
      await cleanup()

      // Close Playwright browsers
      if (states.browser) await states.browser.close()

      // Close active servers
      if (states.server) states.server.close()
    },
  } as BrowserTestOutput

  // Use a getter for `page` so tests always see the latest reference after recovery
  if (isElectron) {
    Object.defineProperty(result, 'page', {
      get: () => states.page,
      enumerable: true,
      configurable: true,
    })
  }

  return result
}

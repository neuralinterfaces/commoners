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
  isElectron as isElectronTarget,
  isTauri,
} from '@commoners/solidarity'
// } from '../core/index'

import { removeDirectory } from '../../core/utils/files.js'

import { join } from 'node:path'
import { createConnection } from 'node:net'
import { execSync } from 'node:child_process'

import { chromium, Page, Browser } from 'playwright'
import { ServiceBuildOptions } from '../../core/types.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Check if a TCP port has a listener by attempting a connection */
const isPortBound = (port: number | string, host = '127.0.0.1'): Promise<boolean> =>
  new Promise(resolve => {
    const sock = createConnection({ port: Number(port), host })
    sock.once('connect', () => {
      sock.destroy()
      resolve(true)
    })
    sock.once('error', () => {
      sock.destroy()
      resolve(false)
    })
    sock.setTimeout(1000, () => {
      sock.destroy()
      resolve(false)
    })
  })

/** Get the PID owning a port (macOS/Linux only, best-effort) */
const getPortOwner = (port: number | string): string | null => {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8',
        timeout: 3000,
      })
      const match = out.trim().match(/\s(\d+)\s*$/)
      return match ? match[1] : null
    }
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8', timeout: 3000 })
    return out.trim().split('\n')[0] || null
  } catch {
    return null
  }
}

/** Collect diagnostic info for CDP connection failures */
const collectCdpDiagnostics = async (cdpPort: string, elapsed: number) => {
  const diag: string[] = []
  diag.push(`[CDP Diagnostics] Connection failed after ${elapsed}ms on port ${cdpPort}`)

  // Check if port is bound at all
  const bound = await isPortBound(cdpPort)
  diag.push(`  Port ${cdpPort} bound: ${bound}`)

  // Check what owns the port
  const owner = getPortOwner(cdpPort)
  diag.push(`  Port owner PID: ${owner || 'none/unknown'}`)

  // Check platform
  diag.push(`  Platform: ${process.platform}`)

  // Check sandbox-related env vars
  const sandboxVars = ['ELECTRON_DISABLE_SANDBOX', 'CHROME_DEVEL_SANDBOX']
  for (const v of sandboxVars) {
    if (process.env[v]) diag.push(`  ${v}=${process.env[v]}`)
  }

  return diag.join('\n')
}

type Output = {
  cleanup: (...args: unknown[]) => void
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
  pages: Record<string, Page>
  browser: Browser
  url: string
  server?: any
  /** Find a page by URL predicate, waiting up to timeoutMs for it to appear */
  findPage: (predicate: (url: string) => boolean, timeoutMs?: number) => Promise<Page | null>
  /** Wait for a config-keyed page (e.g., 'auth', 'home') to appear */
  waitForPage: (key: string, timeoutMs?: number) => Promise<Page | null>
  /** Subscribe to page open/close events: onPage('open', (key, page) => ...) */
  onPage: (event: 'open' | 'close', handler: (key: string | null, page: Page) => void) => () => void
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

  const isTauriTarget = isTauri(target)
  const isElectron = isElectronTarget(target)

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
    // Pass hooks that log Electron stdout/stderr during testing.
    // Without this, startup() emits to no-op hooks and Electron output is lost,
    // making CDP connection failures impossible to diagnose.
    const listeners: Record<string, Array<(event: any) => void>> = {}
    const testHooks = {
      emit: (event: any) => {
        const handlers = listeners[event.type]
        if (handlers) handlers.forEach(h => h(event))
      },
      on: (type: string, handler: (event: any) => void) => {
        ;(listeners[type] = listeners[type] || []).push(handler)
        return () => {
          listeners[type] = listeners[type].filter(h => h !== handler)
        }
      },
    }

    if (isElectron) {
      testHooks.on('dev:electron:stdout', e =>
        console.log(`[Electron:stdout] ${String(e.data).trim()}`)
      )
      testHooks.on('dev:electron:stderr', e =>
        console.log(`[Electron:stderr] ${String(e.data).trim()}`)
      )
    }

    const { url, close: cleanup } = await CommonersStart(updatedConfig, { hooks: testHooks as any })
    Object.assign(states, { url, cleanup })
  }

  // Launched Electron Instance
  //
  // CDP Connection Strategy:
  // 1. Poll HTTP endpoint until CDP server is ready (~2-4s for packaged builds)
  // 2. Close broken targets (e.g. splash screen with missing HTML) that would cause
  //    Playwright to hang — these targets don't respond to CDP page commands, and
  //    Playwright's Target.setAutoAttach + waitForDebuggerOnStart pauses them forever
  // 3. Connect via Playwright's connectOverCDP
  //
  // IMPORTANT: Use 127.0.0.1, not localhost — avoids IPv6 resolution issues on some systems.
  if (isElectron) {
    const cdpPort = process.env.COMMONERS_REMOTE_DEBUGGING_PORT
    const cdpUrl = `http://127.0.0.1:${cdpPort}`

    const cdpTimeout = 30_000
    const start = Date.now()
    let browser: Browser | null = null
    let delay = 500

    // Try both IPv4 and IPv6 loopback — on some Windows configs Chromium binds to [::1] only
    const cdpUrls = [`http://127.0.0.1:${cdpPort}`, `http://[::1]:${cdpPort}`]

    // Step 1: Wait for CDP HTTP endpoint
    let wsUrl: string | null = null
    let activeCdpUrl = cdpUrl // Track which URL actually worked
    let pollAttempts = 0
    let lastError = ''
    let portBoundOnce = false
    while (Date.now() - start < cdpTimeout) {
      pollAttempts++
      for (const url of cdpUrls) {
        try {
          const resp = await fetch(`${url}/json/version`)
          if (resp.ok) {
            const data = await resp.json()
            wsUrl = data.webSocketDebuggerUrl
            activeCdpUrl = url
            console.log(
              `[CDP] Endpoint ready at ${url} after ${Date.now() - start}ms (${pollAttempts} attempts)`
            )
            break
          } else {
            const errText = `HTTP ${resp.status} ${resp.statusText}`
            if (errText !== lastError) {
              console.log(
                `[CDP] Poll #${pollAttempts} (${Date.now() - start}ms): ${errText} (${url})`
              )
              lastError = errText
            }
          }
        } catch (e: any) {
          const errMsg = e?.cause?.code || e?.code || e?.message || String(e)
          if (errMsg !== lastError) {
            console.log(`[CDP] Poll #${pollAttempts} (${Date.now() - start}ms): ${errMsg}`)
            lastError = errMsg
          }
        }
      }
      if (wsUrl) break

      // Periodic port-binding check (every ~5s) for extra diagnostics
      if (pollAttempts % 5 === 0 && !portBoundOnce) {
        const bound = await isPortBound(cdpPort)
        if (bound) {
          portBoundOnce = true
          console.log(
            `[CDP] Port ${cdpPort} is now bound (poll #${pollAttempts}, ${Date.now() - start}ms)`
          )
        }
      }

      await sleep(delay)
      delay = Math.min(delay * 1.5, 3000)
    }

    if (!wsUrl) {
      const diagnostics = await collectCdpDiagnostics(cdpPort, Date.now() - start)
      console.error(diagnostics)
      throw new Error(
        `CDP endpoint not reachable after ${cdpTimeout}ms (tried ${cdpUrls.join(', ')}). Last error: ${lastError}. See diagnostics above.`
      )
    }

    // Step 2: Close broken targets via raw CDP before Playwright connects.
    // Packaged Electron builds may have a splash screen BrowserWindow whose HTML
    // file is missing (404). This creates a CDP page target that accepts session
    // attachment but never responds to Page.enable, Runtime.enable, etc.
    // When Playwright's connectOverCDP sends Target.setAutoAttach with
    // waitForDebuggerOnStart:true, the broken target gets paused forever,
    // causing Playwright to hang for 30s and timeout.
    // Fix: use raw WebSocket to close targets with empty URLs before Playwright connects.
    try {
      const closedTargets = await new Promise<number>(resolve => {
        const ws = new WebSocket(wsUrl!)
        const timer = setTimeout(() => {
          ws.close()
          resolve(0)
        }, 10000)

        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }))
        })

        ws.addEventListener('message', event => {
          const data = JSON.parse(String(event.data))
          if (data.id === 1 && data.result?.targetInfos) {
            const targets = data.result.targetInfos as Array<{
              targetId: string
              url: string
              type: string
            }>
            // Close page targets with empty or missing URLs — these are broken windows
            const broken = targets.filter(
              t => t.type === 'page' && (!t.url || t.url === '' || t.url === 'about:blank')
            )

            if (broken.length === 0) {
              clearTimeout(timer)
              ws.close()
              resolve(0)
              return
            }

            let closedCount = 0
            for (const t of broken) {
              console.log(`[CDP] Closing broken target: ${t.targetId} (url: "${t.url}")`)
              ws.send(
                JSON.stringify({
                  id: 100 + closedCount,
                  method: 'Target.closeTarget',
                  params: { targetId: t.targetId },
                })
              )
              closedCount++
            }

            // Wait briefly for close confirmations, then proceed
            const closeTimer = setTimeout(() => {
              clearTimeout(timer)
              ws.close()
              resolve(closedCount)
            }, 2000)

            let responses = 0
            ws.addEventListener('message', evt => {
              const msg = JSON.parse(String(evt.data))
              if (msg.id && msg.id >= 100) {
                responses++
                if (responses >= closedCount) {
                  clearTimeout(closeTimer)
                  clearTimeout(timer)
                  ws.close()
                  resolve(closedCount)
                }
              }
            })
          }
        })

        ws.addEventListener('error', () => {
          clearTimeout(timer)
          resolve(0)
        })
      })

      if (closedTargets > 0) {
        console.log(`[CDP] Closed ${closedTargets} broken target(s), waiting for cleanup...`)
        await sleep(1000) // Give CDP server time to clean up closed targets
      }
    } catch (e: any) {
      console.log(`[CDP] Target cleanup warning: ${e.message}`)
    }

    // Step 3: Connect via Playwright CDP (use the URL that responded in Step 1)
    try {
      browser = await chromium.connectOverCDP(activeCdpUrl, { timeout: cdpTimeout })
      console.log(`[CDP] Playwright connected after ${Date.now() - start}ms`)
    } catch (e: any) {
      const diagnostics = await collectCdpDiagnostics(cdpPort, Date.now() - start)
      console.error(diagnostics)
      throw new Error(
        `CDP Playwright connection failed after ${cdpTimeout}ms (${activeCdpUrl}): ${(e.message || '').slice(0, 300)}`
      )
    }

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
        console.log(
          `[CDP] Found ${pages.length} page(s) at ${((Date.now() - pageStart) / 1000).toFixed(1)}s`
        )
        for (const p of pages) {
          try {
            console.log(`  - ${p.url()}`)
          } catch {
            /* ignored */
          }
        }
        lastPageCount = pages.length
      }
      for (const p of pages) {
        try {
          // Prefer the main window (DESKTOP.__main === true) over splash/plugin windows.
          // All windows have the commoners global via preload, but only the main window
          // has __main set. Fall back to any page with commoners if __main isn't found yet.
          const pageInfo = await p.evaluate(() => {
            const c = globalThis.commoners
            if (!c) return { hasCommoners: false, isMain: false }
            const desktop = c.DESKTOP
            return {
              hasCommoners: true,
              isMain:
                desktop && typeof desktop === 'object' && '__main' in desktop && desktop.__main,
            }
          })
          if (pageInfo.isMain) {
            states.page = p
            break
          }
          // Track commoners pages as fallback (might be splash)
          if (pageInfo.hasCommoners && !states.page) {
            states.page = p
          }
        } catch {
          /* ignored */
        } // Page may be closed (e.g., splash screen) or not ready
      }
      // Only stop searching when we find the actual main window.
      // Splash/plugin pages have commoners but not __main — keep waiting
      // for createMainWindow() to run after all ready() hooks complete.
      const foundMain =
        states.page &&
        (await states.page
          .evaluate(() => {
            const c = globalThis.commoners
            return c?.DESKTOP && typeof c.DESKTOP === 'object' && c.DESKTOP.__main
          })
          .catch(() => false))
      if (foundMain) break
      // If fallback page closed (splash dismissed), clear it so we keep looking
      if (states.page) {
        try {
          await states.page.url()
        } catch {
          states.page = undefined
        }
      }
      await sleep(500)
    }

    if (!states.page) {
      const pages = defaultContext.pages()
      console.error(
        `[CDP] Page finding timed out after ${pageTimeout}ms. ${pages.length} page(s) available:`
      )
      for (const p of pages) {
        try {
          const url = p.url()
          let evalResult = 'unknown'
          try {
            evalResult = await p.evaluate(() => {
              const keys = Object.keys(globalThis).filter(
                k => k.startsWith('commoners') || k.startsWith('__commoners')
              )
              return `globals: [${keys.join(', ')}], typeof commoners: ${typeof (globalThis as any).commoners}`
            })
          } catch (evalErr: any) {
            evalResult = `evaluate failed: ${evalErr.message?.slice(0, 100)}`
          }
          console.error(`  - ${url} | ${evalResult}`)
        } catch {
          /* ignored */
        }
      }
      throw new Error('Could not find main application page with commoners global')
    }

    // Build a keyed pages record from config pages and plugin assets.
    // Maps config keys (e.g., 'home', 'auth') to CDP Page objects by URL matching.
    const pagesRecord: Record<string, Page> = {}

    const buildPagesRecord = () => {
      const allPages = defaultContext.pages()
      // Map config-declared pages by key
      if (updatedConfig.pages) {
        for (const [key, htmlPath] of Object.entries(updatedConfig.pages)) {
          const normalizedPath = String(htmlPath).replace(/\\/g, '/').split('/').pop() || ''
          const match = allPages.find(p => {
            try {
              return p.url().includes(normalizedPath)
            } catch {
              return false
            }
          })
          if (match) pagesRecord[key] = match
        }
      }
      // Map plugin asset pages by plugin key
      if (updatedConfig.plugins) {
        for (const [key, plugin] of Object.entries(updatedConfig.plugins)) {
          const assets = (plugin as any)?.assets
          if (!assets) continue
          for (const assetPath of Object.values(assets)) {
            const normalizedPath = String(assetPath).replace(/\\/g, '/').split('/').pop() || ''
            const match = allPages.find(p => {
              try {
                return p.url().includes(`plugins/${key}`) || p.url().includes(normalizedPath)
              } catch {
                return false
              }
            })
            if (match && !pagesRecord[key]) pagesRecord[key] = match
          }
        }
      }
    }

    // Wait for a specific page to appear by URL predicate
    const findPageByUrl = async (
      predicate: (url: string) => boolean,
      timeoutMs = 15_000
    ): Promise<Page | null> => {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const allPages = defaultContext.pages()
        for (const p of allPages) {
          try {
            if (predicate(p.url())) return p
          } catch {
            /* ignored */
          }
        }
        await sleep(300)
      }
      return null
    }

    // Page lifecycle event emitter
    type PageEventType = 'open' | 'close'
    type PageEventHandler = (key: string | null, page: Page) => void
    const pageListeners: Record<PageEventType, PageEventHandler[]> = { open: [], close: [] }

    const onPage = (event: PageEventType, handler: PageEventHandler) => {
      pageListeners[event].push(handler)
      return () => {
        pageListeners[event] = pageListeners[event].filter(h => h !== handler)
      }
    }

    const emitPageEvent = (event: PageEventType, key: string | null, page: Page) => {
      pageListeners[event].forEach(h => h(key, page))
    }

    // Build initial pages record, then auto-update when new windows appear
    buildPagesRecord()

    // Listen for new pages (plugin windows created async in ready() hooks)
    defaultContext.on('page', newPage => {
      const prevKeys = new Set(Object.keys(pagesRecord))
      buildPagesRecord()
      // Find which key was added
      const newKey = Object.keys(pagesRecord).find(k => !prevKeys.has(k)) || null
      emitPageEvent('open', newKey, newPage)
      // Track close events
      newPage.on('close', () => {
        const closedKey = Object.entries(pagesRecord).find(([, p]) => p === newPage)?.[0] || null
        if (closedKey) delete pagesRecord[closedKey]
        emitPageEvent('close', closedKey, newPage)
      })
    })

    // Track close events for initial pages too
    for (const p of defaultContext.pages()) {
      p.on('close', () => {
        const closedKey = Object.entries(pagesRecord).find(([, pg]) => pg === p)?.[0] || null
        if (closedKey) delete pagesRecord[closedKey]
        emitPageEvent('close', closedKey, p)
      })
    }

    // Expose a waitForPage(key) that blocks until a config-keyed page appears
    const waitForPage = async (key: string, timeoutMs = 15_000): Promise<Page | null> => {
      if (pagesRecord[key]) return pagesRecord[key]
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        buildPagesRecord()
        if (pagesRecord[key]) return pagesRecord[key]
        await sleep(300)
      }
      return null
    }

    states.pages = pagesRecord
    states.findPage = findPageByUrl
    ;(states as any).waitForPage = waitForPage
    ;(states as any).onPage = onPage

    // Page recovery: when Chromium subprocesses crash, the CDP page can close.
    // Track this and attempt to re-find the page from the browser context.
    const testStart = Date.now()
    const elapsed = () => `${((Date.now() - testStart) / 1000).toFixed(1)}s`
    let pageNeedsRecovery = false

    const findPage = async (retries = 5, backoffMs = 500) => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const pages = defaultContext.pages()
          for (const p of pages) {
            try {
              const hasCommoners = await p.evaluate(
                () => typeof globalThis.commoners !== 'undefined'
              )
              if (hasCommoners) return p
            } catch {
              /* ignored */
            }
          }
        } catch {
          /* ignored */
        }
        if (attempt < retries - 1) await sleep(backoffMs * (attempt + 1))
      }
      return null
    }

    const registerPageEventListeners = (page: Page) => {
      page.on('close', () => {
        console.warn(`[CDP] Page closed at ${elapsed()}`)
        pageNeedsRecovery = true
      })
      page.on('crash', () => {
        console.warn(`[CDP] Page crashed at ${elapsed()}`)
        pageNeedsRecovery = true
      })
    }

    registerPageEventListeners(states.page)
    browser.on('disconnected', () => console.warn(`[CDP] Browser disconnected at ${elapsed()}`))

    // Wrap the page in a proxy that auto-recovers on stale page references.
    // Intercepts all function calls (not just evaluate) so that any method
    // invoked after a page close/crash triggers recovery first.
    let currentPage: Page = states.page
    const createRecoverablePageProxy = (page: Page): Page => {
      currentPage = page
      return new Proxy(page, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver)
          // Only intercept function calls — property reads (url, etc.) pass through
          if (typeof value !== 'function') return value
          // Skip event listener methods and internal props to avoid infinite loops
          if (
            typeof prop === 'string' &&
            (prop.startsWith('on') ||
              prop === 'then' ||
              prop === 'removeListener' ||
              prop === 'listenerCount')
          )
            return value

          return async (...args: any[]) => {
            if (pageNeedsRecovery) {
              console.log(
                `[CDP] Attempting page recovery before ${String(prop)}() at ${elapsed()}...`
              )
              const newPage = await findPage()
              if (newPage) {
                console.log(`[CDP] Page recovered at ${elapsed()}`)
                currentPage = newPage
                pageNeedsRecovery = false
                registerPageEventListeners(newPage)
                // Update the proxy target via states.page so the getter returns this proxy
                states.page = createRecoverablePageProxy(newPage)
                return (newPage as any)[prop](...args)
              }
              console.warn(`[CDP] Page recovery failed at ${elapsed()}, calling on stale page`)
            }
            return (currentPage as any)[prop](...args)
          }
        },
      }) as Page
    }

    states.page = createRecoverablePageProxy(states.page)
  }

  // Tauri Instance (WebDriver via tauri-driver)
  else if (isTauriTarget) {
    if (!useBuild) {
      throw new Error(
        'Tauri testing requires a built application (useBuild=true). ' +
          'tauri-driver cannot connect to a dev server.'
      )
    }

    const { connectTauri } = await import('./tauri.js')
    const { findTauriExecutable } = await import(
      '../../core/flows/strategies/TauriLaunchStrategy.js'
    )

    const appPath = findTauriExecutable(outDir)
    if (!appPath) {
      throw new Error(
        `Could not find Tauri executable in ${outDir}. ` +
          'Ensure the Tauri build completed successfully.'
      )
    }

    const tauri = await connectTauri({ appPath })

    // Wrap the TauriPageProxy as a Playwright-compatible Page for the test harness
    states.page = tauri.page as any

    // Store tauri cleanup for later
    ;(states as any).__tauriCleanup = tauri.cleanup
    states.pages = {}
    states.findPage = async () => null
    ;(states as any).waitForPage = async () => null
    ;(states as any).onPage = () => () => {}
  }

  // Non-Desktop Instance
  else {
    const browser = (states.browser = await chromium.launch({ headless: true }))
    const page = (states.page = await browser.newPage())
    await page.goto(states.url)
    states.pages = {}
    states.findPage = async () => null
    ;(states as any).onPage = () => () => {}
    ;(states as any).waitForPage = async () => null
  }

  const result = {
    ...states,

    // Override cleanup function
    cleanup: async () => {
      // Fully close the Tauri instance
      if (isTauriTarget && (states as any).__tauriCleanup) {
        try {
          await (states as any).__tauriCleanup()
        } catch (e: any) {
          console.warn(`[cleanup] Tauri cleanup warning: ${e.message}`)
        }
      }

      // Fully close the Electron instance
      else if (isElectron && states.page) {
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
      try {
        if (states.cleanup) await states.cleanup()
      } catch (e: any) {
        console.warn(`[cleanup] Start manager close warning: ${e.message}`)
      }

      // Run solidarity cleanup chain (kills Electron process tree via onCleanup handlers)
      try {
        await cleanup()
      } catch (e: any) {
        console.warn(`[cleanup] Solidarity cleanup warning: ${e.message}`)
      }

      // Close Playwright browsers (may already be disconnected)
      try {
        if (states.browser) await states.browser.close()
      } catch (e: any) {
        console.warn(`[cleanup] Browser close warning: ${e.message}`)
      }

      // Close active servers
      try {
        if (states.server)
          await new Promise<void>(resolve => {
            states.server.close(() => resolve())
            // Fallback if close callback never fires
            setTimeout(resolve, 3000)
          })
      } catch (e: any) {
        console.warn(`[cleanup] Server close warning: ${e.message}`)
      }
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

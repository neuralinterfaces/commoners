/**
 * Electron Main Process - Orchestration Layer
 *
 * This file coordinates all Electron main process functionality by delegating
 * to specialized modules. It serves as the entry point and orchestrator.
 */

import type { BrowserWindow } from 'electron'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as utils from '@electron-toolkit/utils'

import * as services from '../services/index'
import { existsSync } from 'node:fs'
import {
  ElectronBrowserWindowFlags,
  ElectronWindowOptions,
  ExtendedElectronBrowserWindow,
} from '../../types'
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from '../utils/icons'
// Inline toFilePath to avoid cross-directory import that breaks Rollup bundling
const toFilePath = (urlOrPathname: string): string => {
  if (urlOrPathname.startsWith('file://')) return fileURLToPath(urlOrPathname)
  if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(urlOrPathname)) return urlOrPathname.slice(1)
  return urlOrPathname
}
import { resolveHooks } from '../utils/hooks'

// Import all modules
import * as Config from './modules/config'
import * as Security from './modules/security'
import * as IPC from './modules/ipc'
import * as Window from './modules/window'
import * as Protocol from './modules/protocol'
import * as Lifecycle from './modules/lifecycle'
import * as Plugins from './modules/plugins'
import { Commands } from './modules/commands'
import { generateIPCAllowlist, validateChannel, serializeAllowlist } from './modules/ipc-allowlist'
import type { IPCAllowlist } from './modules/ipc-allowlist'

// Runtime abstraction
import { createElectronRuntime } from '../runtime/electron'
import type { DesktopRuntime } from '../runtime/types'
const runtime: DesktopRuntime = createElectronRuntime()

// Configure IPC module with runtime backend
IPC.setIPCBackend(runtime.native.ipcMain, () => runtime.window.getAll())
IPC.setSendToRenderer((win, channel, ...args) => runtime.window.sendToRenderer(win, channel, ...args))

// ------------------------ Configuration ------------------------
const isProduction = !utils.is.dev
const paths = Config.getPaths(isProduction)
const { ASSET_ROOT_DIR, PROJECT_ROOT_DIR, viteAssetsPath, DEV_SERVER_URL } = paths

const electronConfig = Config.loadConfig()
const { config, electron: electronOptions, plugins } = electronConfig

const options = Config.parseOptions(electronConfig, isProduction)
const { protocolOptions, windowOptions, securitySettings } = options

// Generate capabilities-driven IPC allowlist from declared plugins and services
const pluginIds = Object.keys(plugins)
const serviceIds = Object.keys(config.services || {})
const ipcAllowlist = generateIPCAllowlist(pluginIds, serviceIds)

// Set remote debugging port early — must happen before app.whenReady()
// This is done here (not in the plugin start() hook) because Chromium reads
// command-line switches during initialization, which may complete before the
// async plugin lifecycle runs.
if (process.env.__COMMONERS_TESTING) {
  const testingPlugin = Object.values(plugins).find(
    (p: any) => p.options?.remoteDebuggingPort
  )
  if (testingPlugin) {
    const { remoteDebuggingPort, remoteAllowOrigins } = (testingPlugin as any).options
    if (remoteDebuggingPort)
      runtime.app.commandLine.appendSwitch('remote-debugging-port', `${remoteDebuggingPort}`)
    if (remoteAllowOrigins)
      runtime.app.commandLine.appendSwitch('remote-allow-origins', `${remoteAllowOrigins}`)
  }
}

// ------------------------ Setup ------------------------
Lifecycle.setupQuitHandler(() => runtime.lifecycle.quit())
Lifecycle.handleUncaughtExceptions((title, content) => runtime.dialog.showErrorBox(title, content))

// Configure capabilities-driven IPC allowlist
IPC.setIPCAllowlist(ipcAllowlist)

// Block application startup until verification is complete
Security.runVerification(isProduction, {
  showErrorBox: (title, content) => runtime.dialog.showErrorBox(title, content),
  getAppName: () => runtime.app.getName(),
  quit: () => runtime.lifecycle.quit(),
}).then(async isValid => {
  if (!isValid) return

  const hooks = await resolveHooks(electronOptions.hooks, config.hooks)

  // Provide hooks to IPC module for validation event emission
  IPC.setHooks(hooks)

  // ------------------------ Helper Functions ------------------------
  const callbacks = new IPC.CallbackManager()

  const onRendererReady = (id: number, callback: () => void) =>
    callbacks.add(`ready:renderer:${id}`, callback)
  const onMainReady = (id: number, callback: () => void) =>
    callbacks.add(`ready:main:${id}`, callback)
  const onLoaded = (id: number, pluginId: string, callback: () => void) =>
    callbacks.add(`loaded:${id}:${pluginId}`, callback)

  // ------------------------ Platform Detection ------------------------
  const platform = Lifecycle.getPlatform()
  const isWindows = platform === 'windows'
  const isLinux = platform === 'linux'

  // ------------------------ Window Management Setup ------------------------
  const windowContext = Window.getWindowContext()

  const preload = join(ASSET_ROOT_DIR, 'preload.cjs')

  const defaultIcon = getIcon(config.icon, {
    preferredFormats: isWindows ? ELECTRON_WINDOWS_PREFERENCE : ELECTRON_PREFERENCE,
  })

  const linuxIcon = defaultIcon
  const platformDependentWindowConfig = isLinux && linuxIcon ? { icon: linuxIcon } : {}

  Security.applySecuritySettings(securitySettings)

  // Aggregate window options from plugins
  Object.entries(plugins).forEach(([id, plugin]) => {
    const { desktop: { mainWindowOverrides } = {} } = plugin
    if (!mainWindowOverrides) return
    Object.assign(windowOptions, mainWindowOverrides)
  })

  const defaultWindowConfig = {
    autoHideMenuBar: true,
    ...platformDependentWindowConfig,
  }

  // ------------------------ Page Loading Helpers ------------------------
  function getPageLocation(pathname: string = 'index.html', alt = false): string | null {
    if (DEV_SERVER_URL) return new URL(pathname, DEV_SERVER_URL).href

    // Normalize the pathname (resolve .. and . in paths)
    pathname = toFilePath(normalize(pathname))

    const isContained = Protocol.normalizeAndCompare(pathname, ASSET_ROOT_DIR, (a, b) =>
      a.startsWith(b)
    )

    const location = isContained ? pathname : join(ASSET_ROOT_DIR, pathname)

    // If location has an extension, verify it exists
    if (extname(location)) {
      if (!existsSync(location)) return null // File does not exist
      return location
    }

    // No extension - try different variations
    const html = location + '.html'
    const index = join(location, 'index.html')

    // For ASAR files, we can't use existsSync/lstatSync to check directories
    // So we always try index.html first for paths without extensions
    // This handles both regular directories and ASAR virtual directories

    // Try in order: index.html in directory, .html file, fallback to index
    if (existsSync(index)) return index
    if (existsSync(html)) return html

    // In production (ASAR), fall back since existsSync may not work for virtual directories
    if (isProduction) return alt ? html : index

    // In dev mode, no phantom pages — file must actually exist
    return null
  }

  async function loadPage(win: BrowserWindow, page?: string): Promise<string> {
    if (page && Protocol.isValidUrl(page)) {
      runtime.window.loadURL(win, page)
      return page
    }

    const location = getPageLocation(page)

    if (!location) {
      console.error(`[404] Page not found: ${page}`)
      return ''
    }

    try {
      new URL(location)
      runtime.window.loadURL(win, location)
      return location
    } catch {}

    const loadFile = (loc: string) => runtime.window.loadURL(win, pathToFileURL(loc).href)

    const result = await loadFile(location)
      .then(() => location)
      .catch(() => {
        const altLocation = getPageLocation(page, true)
        if (!altLocation) return ''
        loadFile(altLocation)
        return altLocation
      })

    return result
  }

  // ------------------------ Plugin System ------------------------
  const { plugins: mutablePlugins, contexts: pluginContexts } = Plugins.initializePlugins(
    plugins,
    viteAssetsPath,
    isProduction,
    runtime.native,
    utils,
    createWindow,
    Window.restoreWindow,
    runtime,
    hooks
  )

  const boundRunAppPlugins = Plugins.createBoundRunAppPlugins(
    mutablePlugins,
    pluginContexts,
    isProduction
  )

  // Module-level state for preload data injection (eliminates sendSync)
  let __sanitizedServices: Record<string, any> = {}
  let __serviceStatuses: Record<string, any> = {}

  // ------------------------ Window Creation ------------------------
  async function createWindow(
    page?: string,
    options: ElectronWindowOptions = {},
    toIgnore: string[] = [],
    isMainWindow: boolean = false
  ): Promise<BrowserWindow> {
    if (typeof options === 'function') options = options.call(runtime.native)
    const { onInitialized, ...coreOptions } = options

    const copy = structuredClone({ ...defaultWindowConfig, ...coreOptions })

    if (!copy.webPreferences) copy.webPreferences = {}
    const { webPreferences } = copy
    if (!('preload' in webPreferences)) webPreferences.preload = preload
    if (!('additionalArguments' in webPreferences)) webPreferences.additionalArguments = []

    const securitySettingsForWebPreferences = Security.getWebPreferencesSecuritySettings(securitySettings)
    Object.assign(webPreferences, securitySettingsForWebPreferences)

    const __listeners: IPC.ListenerHandle[] = []
    const __id = Window.getNextWindowId()
    const transferredFlags = { __id, __main: isMainWindow }

    const __location = { search: undefined, hash: undefined }

    webPreferences.additionalArguments.push(
      ...Object.entries(transferredFlags).map(([key, value]) => `--${key}=${value}`),
      `--__ipcAllowlist=${serializeAllowlist(ipcAllowlist)}`,
      `--__services=${JSON.stringify(__sanitizedServices)}`,
      `--__serviceStatuses=${JSON.stringify(__serviceStatuses)}`,
      `--__location=${JSON.stringify(__location)}`
    )

    const flags = {
      ...transferredFlags,
      __show: true,
      __listeners,
      __loading: {},
      __loaded: Promise.resolve(),
    } as ElectronBrowserWindowFlags

    const win = await runtime.window.create(undefined, copy) as ExtendedElectronBrowserWindow
    Object.assign(win, flags)

    const onReadyPromise = new Promise(resolve => onRendererReady(__id, () => resolve(true)))

    runtime.window.onWebContentsEvent(win, 'did-fail-load', (_e, errorCode, errorDesc) => {
      console.error(`[LOAD FAIL] ${errorCode}: ${errorDesc}`)
    })

    runtime.window.onWebContentsEvent(win, 'crashed', () => console.error('[RENDERER CRASHED]'))

    const { devTools } = webPreferences
    if (devTools === false) runtime.window.onWebContentsEvent(win, 'devtools-opened', () => win.webContents.closeDevTools())

    Window.setupWindowBehaviors(win)

    Window.registerWindow(__id, win)
    Window.updateWindowLocation(__id, __location)

    // Navigation handling
    runtime.window.onNavigate(win, async (event, url) => {
      event.preventDefault()

      const urlObj = new URL(url)

      if (!Protocol.isCommonersUrl(url, DEV_SERVER_URL)) {
        const type = await Protocol.checkLinkType(url)
        if (type === 'download') return win.webContents.downloadURL(url)
        if (isMainWindow) return runtime.shell.openExternal(url)
        else return runtime.window.loadURL(win, url)
      }

      __location.search = urlObj.search
      __location.hash = urlObj.hash
      Window.updateWindowLocation(__id, __location)

      // Extract path relative to ASSET_ROOT_DIR
      // This handles cases where navigation resolves to the ASAR file itself or parent directories
      let pathname = urlObj.pathname

      // Handle ASAR paths - extract path within the ASAR archive
      // URL pathname will be like: /path/to/app.asar/pages/windows/index.html
      // We need to extract just: pages/windows/index.html
      const asarIndex = pathname.indexOf('.asar/')
      if (asarIndex !== -1) {
        // Extract path after .asar/
        pathname = pathname.slice(asarIndex + 6) // '.asar/'.length = 6
        if (!pathname || pathname === '/') pathname = 'index.html'
      } else if (pathname.endsWith('.asar')) {
        // Navigation resolved exactly to the .asar file (e.g., '../..')
        pathname = 'index.html'
      } else if (pathname.startsWith(ASSET_ROOT_DIR)) {
        // Non-ASAR path relative to ASSET_ROOT_DIR
        pathname = pathname.slice(ASSET_ROOT_DIR.length)
        if (pathname.startsWith('/')) pathname = pathname.slice(1)
        if (!pathname) pathname = 'index.html'
      }

      await loadPage(win, pathname)
    })

    Object.defineProperty(win, '__show', {
      get: () => flags.__show,
      set: v => {
        if (flags.__show === null) return
        flags.__show = v
      },
      configurable: false,
    })

    if (isMainWindow) {
      runtime.window.onClose(win, () => {
        Window.setMainWindow(null)
      })
    }

    runtime.ipc.once(Commands.quit.channel, (_, message) => globalThis.COMMONERS_QUIT?.(message))

    runtime.window.setWindowOpenHandler(win, ({ url }) => {
      runtime.shell.openExternal(url)
      return { action: 'deny' }
    })

    runtime.window.onClose(win, async () => {
      await Plugins.runPluginHooks(win, 'unload', mutablePlugins, pluginContexts, toIgnore)
      __listeners.forEach(l => l.remove())
    })

    // Run plugin load hooks
    const called = Object.keys(mutablePlugins).reduce((acc, id) => {
      acc[id] = Plugins.runPluginHook(win, id, 'load', mutablePlugins, pluginContexts, createWindow)
      return acc
    }, {} as Record<string, Promise<any>>)

    win.__loading = Object.entries(called).reduce((acc, [id, promise]) => {
      acc[id] = new Promise(resolve => onLoaded(__id, id, async () => resolve(await promise)))
      return acc
    }, {} as Record<string, Promise<any>>)

    win.__loaded = Promise.all(Object.values(win.__loading)).then(() => {})

    const loadPromise = loadPage(win, page)

    if (onInitialized) onInitialized.call(runtime.native, win)

    await loadPromise
      .then(async location => {
        const isAsset = Protocol.isCommonersAsset(location, ASSET_ROOT_DIR, DEV_SERVER_URL)

        if (isAsset) {
          await new Promise(async resolve => {
            await onReadyPromise
            onMainReady(__id, () => resolve(true))
            IPC.send(win, Commands.mainReadyPing.channel, __id)
          })
        } else {
          await new Promise(async resolve => runtime.window.onReadyToShow(win, () => resolve(true)))
        }
      })
      .finally(() => runtime.window.show(win))

    return win
  }

  async function createMainWindow(): Promise<BrowserWindow | undefined> {
    return Window.createMainWindow(createWindow, windowOptions, () => runtime.window.getAll())
  }

  // ------------------------ IPC Handlers ------------------------
  IPC.setupConsoleRedirection()

  // Event bus relay: broadcast to all other windows, excluding sender
  runtime.ipc.on('commoners:bus:emit', (event, topic, data) => {
    const senderWebContents = event.sender
    const allWindows = runtime.window.getAll()
    for (const win of allWindows) {
      if (win.webContents !== senderWebContents && !win.isDestroyed()) {
        win.webContents.send('commoners:bus:receive', topic, data)
      }
    }
  })

  runtime.ipc.on(Commands.close.channel, (_, _id) => {
    const win = Window.getWindowById(_id)
    if (win && !win.isDestroyed()) win.close()
    Window.unregisterWindow(_id)
  })

  runtime.ipc.on(Commands.location.channel, (ev, id) => {
    ev.returnValue = Window.getWindowLocation(id)
  })

  runtime.ipc.on(Commands.rendererReady.channel, (_, id) => {
    const win = Window.getWindowById(id)
    const isMain = win && (win as ExtendedElectronBrowserWindow).__main

    if (isMain) {
      Window.setMainWindow(win)
      Window.setFirstInitialized()
      Window.flushReadyQueue(win)
    }

    callbacks.run(`ready:renderer:${id}`)
  })

  runtime.ipc.on(Commands.pluginsLoaded.channel, (_, pageId, pluginId) =>
    callbacks.run(`loaded:${pageId}:${pluginId}`)
  )
  runtime.ipc.on(Commands.mainReadyPong.channel, (_, id) => callbacks.run(`ready:main:${id}`))

  // ------------------------ Single Instance ------------------------
  Window.makeSingleInstance(Window.restoreWindow, {
    requestLock: () => runtime.native.app.requestSingleInstanceLock(),
    exit: () => runtime.lifecycle.exit(),
    onSecond: (cb) => runtime.native.app.on('second-instance', cb),
  })

  // ------------------------ Protocol Registration ------------------------
  const hasCustomProtocol = !!protocolOptions.scheme
  if (hasCustomProtocol) {
    runtime.protocol.registerScheme(protocolOptions)
  }

  if (config.name) runtime.app.setName(config.name)

  // ------------------------ Service Hash Manifest ------------------------
  let serviceHashManifest: Record<string, string> | null = null
  let inlineScriptHash: string | undefined
  if (isProduction) {
    try {
      const hashManifestPath = join(ASSET_ROOT_DIR, 'service-hashes.json')
      if (existsSync(hashManifestPath)) {
        const { readFileSync } = require('node:fs')
        serviceHashManifest = JSON.parse(readFileSync(hashManifestPath, 'utf8'))
      }
    } catch {}

    try {
      const scriptHashPath = join(ASSET_ROOT_DIR, 'script-hashes.json')
      if (existsSync(scriptHashPath)) {
        const { readFileSync } = require('node:fs')
        const scriptHashes = JSON.parse(readFileSync(scriptHashPath, 'utf8'))
        inlineScriptHash = scriptHashes.inlineScriptHash
      }
    } catch {}
  }

  // ------------------------ Service Resolution ------------------------
  const baseServiceOptions = { target: 'desktop', build: isProduction, root: PROJECT_ROOT_DIR }

  services.resolveAll(config.services, baseServiceOptions).then(async resolvedServices => {
    await boundRunAppPlugins([resolvedServices])

    runtime.lifecycle.onReady(async () => {
      // Collect service URLs for CSP connect-src
      const serviceUrls = Object.values(resolvedServices)
        .map((s: any) => s.url)
        .filter(Boolean) as string[]

      // Setup Content Security Policy
      Security.setupContentSecurityPolicy(csp => runtime.session.setupCSP(csp), securitySettings.csp, DEV_SERVER_URL, serviceUrls, inlineScriptHash)

      // Setup STDIN commands
      Lifecycle.setupStdinCommands(() => runtime.window.getAll())

      // Create services
      const output = await services.createAll(resolvedServices, {
        ...baseServiceOptions,
        onClosed: (id: string, code: number) => runtime.scopedIPC.serviceSend(id, 'closed', code),
        onLog: (id: string, msg: Buffer) => runtime.scopedIPC.serviceSend(id, 'log', msg.toString()),
        hooks,
        hashManifest: serviceHashManifest,
      })

      const { active = {}, resolved = {}, close: closeService } = output

      // Populate module-level state so future windows get services via additionalArguments
      __sanitizedServices = services.sanitize(resolved)
      __serviceStatuses = Object.fromEntries(
        Object.keys(resolved).map(id => [id, id in active ? active[id].status : 'remote'])
      )

      // Keep sync handler as fallback for windows created before services resolved
      runtime.ipc.on(Commands.services.channel, ev => { ev.returnValue = __sanitizedServices })

      // Track service status and health
      const healthMonitors = new Map<string, any>()
      for (let id in resolved) {
        const isRemote = !(id in active)
        runtime.scopedIPC.serviceOn(id, 'status', ev => { ev.returnValue = isRemote ? 'remote' : active[id].status })
        runtime.scopedIPC.serviceOn(id, 'close', () => isRemote || closeService(id))

        // Health monitoring: start monitor if service has a URL and monitor config
        const serviceConfig = resolved[id] as any
        if (serviceConfig.url && serviceConfig.monitor) {
          import('../services/health').then(({ ServiceHealthMonitor }) => {
            const monitor = new ServiceHealthMonitor(
              id,
              serviceConfig.url,
              serviceConfig.monitor,
              hooks,
              () => {
                // Auto-restart: close and re-create the service
                if (active[id]) {
                  closeService(id)
                  services.start(resolved[id], id, { ...baseServiceOptions, hooks }).then(result => {
                    if (result) active[id] = result
                  })
                }
              },
            )
            monitor.start()
            healthMonitors.set(id, monitor)
          })
        }

        // Health IPC handler
        runtime.scopedIPC.scopedHandle('services', id, 'health', async () => {
          const monitor = healthMonitors.get(id)
          return monitor ? monitor.getStatus() : 'unknown'
        })
      }

      // Custom protocol handler
      if (hasCustomProtocol) {
        const { scheme } = protocolOptions
        runtime.app.setAppUserModelId(`com.${scheme}`)

        runtime.protocol.handleRequest(scheme, async req => {
          // Validate request origin to prevent cross-origin access
          const origin = req.headers['origin'] || ''
          const referer = req.headers['referer'] || ''
          const source = origin || referer

          if (source) {
            const isAppOrigin = source.startsWith(`${scheme}://`)
            const isDevOrigin = DEV_SERVER_URL && source.startsWith(DEV_SERVER_URL)
            const isFileOrigin = source.startsWith('file://')
            if (!isAppOrigin && !isDevOrigin && !isFileOrigin) {
              hooks.emit({ type: 'security:protocol:blocked', origin: source, url: req.url })
              return new Response('Forbidden', { status: 403 })
            }
          }

          const loadedURL = new URL(req.url)
          const { host, pathname, search, hash } = loadedURL
          const updatedPathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

          if (host === 'services') {
            const splitPath = updatedPathname.split('/')
            const serviceId = splitPath[0]
            const resolvedPath = splitPath.slice(1).join('/') + search + hash
            const serviceInfo = resolved[serviceId]
            if (serviceInfo?.url) {
              const resolvedURL = new URL(resolvedPath, serviceInfo.url)
              return runtime.protocol.fetch(resolvedURL.href)
            }
            return new Response(`${serviceId} is not a valid service`, { status: 404 })
          }

          if (host === 'plugins') {
            const splitPath = updatedPathname.split('/')
            const pluginId = splitPath[0]
            const pluginPath = splitPath.slice(1).join('/')
            const plugin = plugins[pluginId]
            if (plugin?.assets) {
              const assetKey = Object.keys(plugin.assets).find(k => pluginPath.startsWith(k) || pluginPath === k)
              if (assetKey) {
                const assetLocation = getPageLocation(join('plugins', pluginId, assetKey, pluginPath.slice(assetKey.length)))
                if (!assetLocation) return new Response(`Plugin asset not found: ${pluginPath}`, { status: 404 })
                try {
                  return runtime.protocol.fetch(pathToFileURL(assetLocation).href)
                } catch {
                  return new Response(`Plugin asset not found: ${pluginPath}`, { status: 404 })
                }
              }
            }
            return new Response(`${pluginId} is not a valid plugin`, { status: 404 })
          }

          // Pages host: navigate window and return file content as Response
          const resolvedPath =
            host === 'pages'
              ? updatedPathname
              : (updatedPathname ? `${host}${updatedPathname}` : host)

          // Validate page exists before navigating
          const pageLocation = getPageLocation(resolvedPath)
          if (!pageLocation) {
            return new Response(`Page not found: ${resolvedPath}`, { status: 404 })
          }

          // Propagate search and hash from protocol URL to page location
          const targetWindow = Window.restoreWindow()!
          if (targetWindow) {
            const __location = Window.getWindowLocation((targetWindow as ExtendedElectronBrowserWindow).__id)
            if (__location) {
              __location.search = search || undefined
              __location.hash = hash || undefined
            }
            loadPage(targetWindow, resolvedPath)
          }

          // Return page content as Response to satisfy protocol.handle()
          try {
            const fetchUrl = DEV_SERVER_URL ? pageLocation : pathToFileURL(pageLocation).href
            return runtime.protocol.fetch(fetchUrl)
          } catch {
            return new Response(`Failed to load page: ${resolvedPath}`, { status: 500 })
          }
        })
      }

      await boundRunAppPlugins([active], 'ready')

      createMainWindow()
      runtime.lifecycle.onActivate(() => createMainWindow())
    }).catch(err => {
      console.error('[commoners:main] Error in app.whenReady chain:', err)
    })
  }).catch(err => {
    console.error('[commoners:main] Error in service resolution chain:', err)
  })

  // ------------------------ Lifecycle Handlers ------------------------
  Lifecycle.setupSignalHandlers(Window.setShuttingDown, {
    quit: () => runtime.lifecycle.quit(),
    onReady: (cb) => runtime.lifecycle.onReady(cb),
  })
  Lifecycle.setupDefaultWindowAllClosedHandler(
    (cb) => runtime.native.app.on('window-all-closed', cb)
  )

  runtime.lifecycle.onBeforeQuit(async () => {
    Window.setShuttingDown(true)
    try {
      await boundRunAppPlugins([Lifecycle.getQuitMessage()], 'quit')
      await services.close()
    } catch (err) {
      console.error(err)
    }
  })
})

/**
 * Electron Main Process - Orchestration Layer
 *
 * This file coordinates all Electron main process functionality by delegating
 * to specialized modules. It serves as the entry point and orchestrator.
 */

import electron, { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join, extname, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as utils from '@electron-toolkit/utils'

import * as services from '../services/index'
import { existsSync } from 'node:fs'
import {
  ElectronBrowserWindowFlags,
  ElectronWindowOptions,
  ExtendedElectronBrowserWindow,
} from '../../types'
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from '../utils/icons'
import { toFilePath } from '../../utils/paths'
import { resolveHooks } from '../utils/hooks'

// Import all modules
import * as Config from './modules/config'
import * as Security from './modules/security'
import * as IPC from './modules/ipc'
import * as Window from './modules/window'
import * as Protocol from './modules/protocol'
import * as Lifecycle from './modules/lifecycle'
import * as Plugins from './modules/plugins'

// ------------------------ Configuration ------------------------
const isProduction = !utils.is.dev
const paths = Config.getPaths(isProduction)
const { ASSET_ROOT_DIR, PROJECT_ROOT_DIR, viteAssetsPath, DEV_SERVER_URL } = paths

const electronConfig = Config.loadConfig()
const { config, electron: electronOptions, plugins } = electronConfig

const options = Config.parseOptions(electronConfig, isProduction)
const { protocolOptions, windowOptions, securitySettings } = options

// ------------------------ Setup ------------------------
Lifecycle.setupQuitHandler()
Lifecycle.handleUncaughtExceptions()

// Block application startup until verification is complete
Security.runVerification(isProduction).then(async isValid => {
  if (!isValid) return

  const hooks = await resolveHooks(electronOptions.hooks, config.hooks)

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
  function getPageLocation(pathname: string = 'index.html', alt = false): string {
    if (DEV_SERVER_URL) return new URL(pathname, DEV_SERVER_URL).href

    // Normalize the pathname (resolve .. and . in paths)
    pathname = toFilePath(normalize(pathname))

    const isContained = Protocol.normalizeAndCompare(pathname, ASSET_ROOT_DIR, (a, b) =>
      a.startsWith(b)
    )

    const location = isContained ? pathname : join(ASSET_ROOT_DIR, pathname)

    // If location has an extension, return as is
    if (extname(location)) {
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

    // If neither exists, return index.html (for ASAR compatibility)
    return alt ? html : index
  }

  async function loadPage(win: BrowserWindow, page?: string): Promise<string> {
    if (page && Protocol.isValidUrl(page)) {
      win.loadURL(page)
      return page
    }

    const location = getPageLocation(page)

    try {
      new URL(location)
      win.loadURL(location)
      return location
    } catch {}

    const loadFile = (loc: string) => win.loadURL(pathToFileURL(loc).href)

    const result = await loadFile(location)
      .then(() => location)
      .catch(() => {
        const altLocation = getPageLocation(page, true)
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
    electron,
    utils,
    createWindow,
    Window.restoreWindow
  )

  const boundRunAppPlugins = Plugins.createBoundRunAppPlugins(
    mutablePlugins,
    pluginContexts,
    isProduction
  )

  // ------------------------ Window Creation ------------------------
  async function createWindow(
    page?: string,
    options: ElectronWindowOptions = {},
    toIgnore: string[] = [],
    isMainWindow: boolean = false
  ): Promise<BrowserWindow> {
    if (typeof options === 'function') options = options.call(electron)
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

    webPreferences.additionalArguments.push(
      ...Object.entries(transferredFlags).map(([key, value]) => `--${key}=${value}`)
    )

    const flags = {
      ...transferredFlags,
      __show: true,
      __listeners,
      __loading: {},
      __loaded: Promise.resolve(),
    } as ElectronBrowserWindowFlags

    const win = new BrowserWindow({ ...copy, show: false }) as ExtendedElectronBrowserWindow
    Object.assign(win, flags)

    const onReadyPromise = new Promise(resolve => onRendererReady(__id, () => resolve(true)))

    win.webContents.on('did-fail-load', (e, errorCode, errorDesc) => {
      console.error(`[LOAD FAIL] ${errorCode}: ${errorDesc}`)
    })

    win.webContents.on('crashed', () => console.error('[RENDERER CRASHED]'))

    const { devTools } = webPreferences
    if (devTools === false) win.webContents.on('devtools-opened', () => win.webContents.closeDevTools())

    Window.setupWindowBehaviors(win)

    const __location = { search: undefined, hash: undefined }
    Window.registerWindow(__id, win)
    Window.updateWindowLocation(__id, __location)

    // Navigation handling
    win.webContents.on('will-navigate', async (event, url) => {
      event.preventDefault()

      const urlObj = new URL(url)

      if (!Protocol.isCommonersUrl(url, DEV_SERVER_URL)) {
        const type = await Protocol.checkLinkType(url)
        if (type === 'download') return win.webContents.downloadURL(url)
        if (isMainWindow) return shell.openExternal(url)
        else return win.loadURL(url)
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
      win.once('close', () => {
        Window.setMainWindow(null)
      })
    }

    ipcMain.once('commoners:quit', (_, message) => globalThis.COMMONERS_QUIT?.(message))

    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })

    win.once('close', async () => {
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

    if (onInitialized) onInitialized.call(electron, win)

    await loadPromise
      .then(async location => {
        const isAsset = Protocol.isCommonersAsset(location, ASSET_ROOT_DIR, DEV_SERVER_URL)

        if (isAsset) {
          await new Promise(async resolve => {
            await onReadyPromise
            onMainReady(__id, () => resolve(true))
            IPC.send(win, 'commoners:window:ready:main:ping', __id)
          })
        } else {
          await new Promise(async resolve => win.once('ready-to-show', () => resolve(true)))
        }
      })
      .finally(() => win.show())

    return win
  }

  async function createMainWindow(): Promise<BrowserWindow | undefined> {
    return Window.createMainWindow(createWindow, windowOptions)
  }

  // ------------------------ IPC Handlers ------------------------
  IPC.setupConsoleRedirection()

  ipcMain.on(`commoners:close`, (_, _id) => {
    const win = Window.getWindowById(_id)
    if (win && !win.isDestroyed()) win.close()
    Window.unregisterWindow(_id)
  })

  ipcMain.on(`commoners:location`, (ev, id) => {
    ev.returnValue = Window.getWindowLocation(id)
  })

  ipcMain.on(`commoners:window:ready:renderer:pong`, (_, id) => {
    const win = Window.getWindowById(id)
    const isMain = win && (win as ExtendedElectronBrowserWindow).__main

    if (isMain) {
      Window.setMainWindow(win)
      Window.setFirstInitialized()
      Window.flushReadyQueue(win)
    }

    callbacks.run(`ready:renderer:${id}`)
  })

  ipcMain.on(`commoners:plugins:loaded`, (_, pageId, pluginId) =>
    callbacks.run(`loaded:${pageId}:${pluginId}`)
  )
  ipcMain.on(`commoners:window:ready:main:pong`, (_, id) => callbacks.run(`ready:main:${id}`))

  // ------------------------ Single Instance ------------------------
  Window.makeSingleInstance(Window.restoreWindow)

  // ------------------------ Protocol Registration ------------------------
  const hasCustomProtocol = !!protocolOptions.scheme
  if (hasCustomProtocol) {
    Protocol.registerProtocolScheme(protocolOptions)
  }

  if (config.name) app.setName(config.name)

  // ------------------------ Service Resolution ------------------------
  const baseServiceOptions = { target: 'desktop', build: isProduction, root: PROJECT_ROOT_DIR }

  services.resolveAll(config.services, baseServiceOptions).then(async resolvedServices => {
    await boundRunAppPlugins([resolvedServices])

    app.whenReady().then(async () => {
      // Setup STDIN commands
      Lifecycle.setupStdinCommands()

      // Create services
      const output = await services.createAll(resolvedServices, {
        ...baseServiceOptions,
        onClosed: (id: string, code: number) => IPC.serviceSend(id, 'closed', code),
        onLog: (id: string, msg: Buffer) => IPC.serviceSend(id, 'log', msg.toString()),
        hooks,
      })

      const { active = {}, resolved = {}, close: closeService } = output

      ipcMain.on('commoners:services', event => (event.returnValue = services.sanitize(resolved)))

      // Track service status
      for (let id in resolved) {
        const isRemote = !(id in active)
        IPC.serviceOn(id, 'status', event => (event.returnValue = isRemote ? 'remote' : active[id].status))
        IPC.serviceOn(id, 'close', () => isRemote || closeService(id))
      }

      // Custom protocol handler
      if (hasCustomProtocol) {
        const { scheme } = protocolOptions
        const { protocol, net } = electron
        app.setAppUserModelId(`com.${scheme}`)

        protocol.handle(scheme, req => {
          const loadedURL = new URL(req.url)
          const { host, pathname, search, hash } = loadedURL
          const updatedPathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

          if (host === 'services') {
            const splitPath = updatedPathname.split('/')
            const serviceId = splitPath[0]
            const resolvedPath = splitPath.slice(1).join('/') + search + hash
            const resolvedURL = new URL(resolvedPath, (services as any)[serviceId].url)
            if ((services as any)[host]) return net.fetch(resolvedURL.href)
            return new Response(`${resolvedPath} is not a valid request`, { status: 404 })
          }

          const resolvedPath =
            host === 'pages'
              ? updatedPathname
              : (updatedPathname ? `${host}${updatedPathname}` : host) + search + hash
          loadPage(Window.restoreWindow()!, resolvedPath)
        })
      }

      await boundRunAppPlugins([active], 'ready')

      createMainWindow()
      app.on('activate', () => createMainWindow())
    })
  })

  // ------------------------ Lifecycle Handlers ------------------------
  Lifecycle.setupSignalHandlers(Window.setShuttingDown)
  Lifecycle.setupDefaultWindowAllClosedHandler()

  app.on('before-quit', async ev => {
    ev.preventDefault()
    Window.setShuttingDown(true)
    try {
      await boundRunAppPlugins([Lifecycle.getQuitMessage()], 'quit')
      services.close()
    } catch (err) {
      console.error(err)
    } finally {
      app.exit()
    }
  })
})

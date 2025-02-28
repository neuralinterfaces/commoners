import electron, { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, basename, extname } from 'node:path'
import * as utils from '@electron-toolkit/utils'

import * as services from '../services/index'
import { existsSync } from 'node:fs';
import { ElectronBrowserWindowFlags, ElectronWindowOptions, ExtendedElectronBrowserWindow } from '../../types';
import { runAppPlugins } from '../plugins';
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from '../utils/icons';

function normalizeAndCompare(path1, path2, comparison = (a,b) => a === b) {
  const decodePath = (path) => decodeURIComponent(path.replace(/\/+$/, '')); // Remove trailing slashes and decode
  return comparison(decodePath(path1), decodePath(path2))
}

async function checkLinkType(url) {
  try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition && contentDisposition.includes('attachment')) return 'download'; // Download if attachment
      if (!response.headers.get('Content-Type').startsWith('text/html')) return 'download'; // Download if not an HTML file
      return 'webpage';
  } catch (error) { return 'unknown' }
}

// Custom Window Flags
// __main: Is Main Window
// __show: Used to block show behavior

const assetsPath = join(__dirname, 'assets')

const chalk = import('chalk').then(m => m.default)

function send(this: BrowserWindow, channel: string, ...args: any[]) {
  try {
    return this.webContents.send(channel, ...args)
  } catch (e) { } // Catch in case messages are registered as sendable for a window that has been closed
}

type ReadyFunction = (win: BrowserWindow) => any
let readyQueue: ReadyFunction[] = []

const onWindowReady = (f: ReadyFunction) => globals.mainWindow ? f(globals.mainWindow) : readyQueue.push(f)

const getScopedIdentifier = (type, source, attr) => `${type}:${source}:${attr}`

const scopedOn = (type, id, channel, callback) => {
  const event = getScopedIdentifier(type, id, channel)
  ipcMain.on(event, callback)
  const remove = () => ipcMain.removeListener(event, callback)
  return { 
    remove // A helper function to remove the listener
   } 
}

const scopedSend = (type, id, channel, ...args) => onWindowReady(() => {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(win => send.call(win, getScopedIdentifier(type, id, channel), ...args)) // Send to all windows
})
const serviceSend = (id, channel, ...args) => scopedSend('services', id, channel, ...args)
const serviceOn = (id, channel, callback) => scopedOn('services', id, channel, callback)

const pluginSend = (pluginName, channel, ...args) => scopedSend('plugins', pluginName, channel, ...args)
const pluginOn = (pluginName, channel, callback) => scopedOn('plugins', pluginName, channel, callback)

const globals: {
  firstInitialized: boolean,
  mainWindow: BrowserWindow | null,
  plugins: {
    preload?: any
    load?: any,
    unload?: any
  },
  isShuttingDown: boolean
} = {
  firstInitialized: false,
  isShuttingDown: false,
  mainWindow: null,
  plugins: {}

}

// Transfer all the main console commands to the browser
const ogConsoleMethods: any = {};
['log', 'warn', 'error'].forEach(method => {
  const ogMethod = ogConsoleMethods[method] = console[method]
  console[method] = (...args) => {
    onWindowReady(win => send.call(win, `commoners:console.${method}`, ...args))
    ogMethod(...args)
  }
})

const devServerURL = process.env.VITE_DEV_SERVER_URL
const isProduction = !devServerURL
const isDevServer = utils.is.dev && devServerURL


// Populate platform variable if it doesn't exist
const platform = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

// Get the Commoners configuration file
const configPath = join(assetsPath, 'commoners.config.cjs') // Load the .cjs config version

// --------------- App Window Management ---------------
function restoreWindow() {
  const { mainWindow } = globals
  if (mainWindow) mainWindow.isMinimized() ? mainWindow.restore() : mainWindow.focus();
  return mainWindow
}

async function makeSingleInstance() {
  if (process.mas) return;
  if (!app.requestSingleInstanceLock()) {  
    const _chalk = await chalk
    console.error(_chalk.yellow('Another instance of this application is already running.'))
    app.exit(); // Skip quit callbacks
  }
  else app.on("second-instance", () => restoreWindow());
}

makeSingleInstance();

const _config = require(configPath) // Requires putting the dist at the Resource Path
const config = _config.default || _config


// Copy the plugins in case they aren't extensible
const PLUGINS = Object.entries(config.plugins ?? {}).reduce((acc, [ key, value ]) => {
  acc[key] = { ...value }
  return acc
}, {})

// Precreate contexts to track custom properties 
const contexts = Object.entries(PLUGINS).reduce((acc, [ id, plugin ]) => {

  const { assets = {} } = plugin

  acc[id] = { 
    id,

    MOBILE: false,
    DESKTOP: true,
    WEB: false,

    // Packaged Electron Utilities
    electron,
    utils,

    // Helper Functions
    createWindow: (page: string, opts: ElectronWindowOptions) => createWindow(page, opts),
    open: () => app.whenReady().then(() => globals.firstInitialized && (restoreWindow() || createMainWindow())),
    send: function (channel, ...args) { return pluginSend(this.id, channel, ...args) },
    on: function (channel, callback, win?: BrowserWindow ) { 
      const listener = pluginOn(this.id, channel, callback)
      if (win) win.__listeners.push(listener)
      return listener
     },

    setAttribute: function (win, attr, value) { win[getScopedIdentifier("window", this.id, attr)] = value },
    getAttribute: function (win, attr) { return win[getScopedIdentifier("window", this.id, attr)] },

    // Provide specific variables from the plugin
    plugin: {
      assets: Object.entries(assets).reduce((acc, [ key, src ]) => {
        const filename = basename(src)
        const isHTML = extname(filename) === '.html'
        if ( isDevServer || isHTML ) acc[key] = src
        else acc[key] = join(assetsPath, 'plugins', id, key, filename)
        return acc
      }, {})
    }
  }
  return acc
}, {})


const boundRunAppPlugins = runAppPlugins.bind({
  env: { WEB: false, DESKTOP: true, MOBILE: false, TARGET: "electron", DEV: isDevServer, PROD: !isDevServer },
  plugins: PLUGINS,
  contexts
})


const runWindowPlugin = async (win, id, type) => {

  const plugin = PLUGINS[id]

  const desktopState = plugin.desktop ?? {}

    const types = {
      load: type === "load",
      unload: type === "unload"
    }

    // Coordinate the state transitions for the plugins
    const thisPlugin = desktopState[type]


    if (!thisPlugin) return

    const context = contexts[id]
    
    const { createWindow } = context
    if (types.load) context.createWindow = (page, opts) => createWindow(page, opts, [ id ]) // Do not recursively call window creation in load function
    
    return await thisPlugin.call(context, win, id)
}

const runWindowPlugins = async (win: BrowserWindow | null = null, type = 'load', toIgnore: string[] = []) => {
  return await Promise.all(Object.keys(PLUGINS).map(async (id) => {
    if (toIgnore.includes(id)) return
    return runWindowPlugin(win, id, type)
  }))
}

  // ------------------- Configure the main window properties -------------------  
  const preload = join(__dirname, 'preload.cjs')

  const isWindows = platform === 'windows'
  const isLinux = platform === 'linux'

  const defaultIcon = getIcon(config.icon, {
    preferredFormats: isWindows ? ELECTRON_WINDOWS_PREFERENCE : ELECTRON_PREFERENCE
  })

  const linuxIcon = defaultIcon // config.icon?.linux || defaultIcon

  const platformDependentWindowConfig = (isLinux && linuxIcon) ? { icon: linuxIcon } : {}

  const electronOptions = config.electron ?? {}
  const protocolOptions = electronOptions.protocol ? ( typeof electronOptions.protocol === 'string' ? { scheme: electronOptions.protocol } : electronOptions.protocol ) : {}
  const windowOptions = electronOptions.window ?? {}

  // Aggregate window options on plugins
  Object.entries(PLUGINS).forEach(([ id, plugin ]) => {
    const { desktop: { mainWindowOverrides } = {} } = plugin
    if (!mainWindowOverrides) return
    Object.assign(windowOptions, mainWindowOverrides)
  })

  const defaultWindowConfig = {
    autoHideMenuBar: true,
    webPreferences: { sandbox: false },
    ...platformDependentWindowConfig,
  }


  let windowCount = 0

  // ------------------------ Window Page Load Behavior ------------------------
  const loadPage = (win, page) => {

      const location = getPageLocation(page)

      try {
        new URL(location)
        win.loadURL(location)
      }
  
      // NOTE: Catching the alternative location results in a delay depending on load time
      catch {
        win.loadFile(location).catch(() => win.loadFile(getPageLocation(page, true)))
      }
  }

  async function createWindow (
    page, 
    options: ElectronWindowOptions = {}, 
    toIgnore?: string[], 
    isMainWindow: boolean = false,
  ) {

    if (typeof options === 'function') options = options.call(electron) // Resolve to base options
    const { onInitialized, ...coreOptions } = options

    const copy = structuredClone({...defaultWindowConfig, ...coreOptions})
    
    // Ensure web preferences exist
    if (!copy.webPreferences) copy.webPreferences = {}
    if (!('preload' in copy.webPreferences)) copy.webPreferences.preload = preload // Provide preload script if not otherwise specified
    if (!('additionalArguments' in copy.webPreferences)) copy.webPreferences.additionalArguments = []

    const __listeners = []


    const __id = windowCount
    const transferredFlags = { __id, __main: isMainWindow }

    windowCount++

    copy.webPreferences.additionalArguments.push(...Object.entries(transferredFlags).map(([key, value]) => `--${key}=${value}`))


    const flags = {
      ...transferredFlags,
      __show: true,
      __listeners
    } as ElectronBrowserWindowFlags

    const win = new BrowserWindow({ ...copy, show: false }) as ExtendedElectronBrowserWindow // Always initially hide the window
    Object.assign(win, flags)


    // Safe window management behaviors
    const originalManagers = {
      close: win.close,
      show: win.show
    }

    Object.entries(originalManagers).forEach(([key, value]) => {
      win[key] = function (...args) {
        if (key === 'show' && !win.__show) return // Skip show behavior. Do not show for testing
        if (globals.isShuttingDown) return // Skip if process is shutting down
        return value.call(this, ...args)
      }
    })


    // Catch all navigation events
    win.webContents.on('will-navigate', async (event, url) => {

      event.preventDefault()
      
      const urlObj = new URL(url)
      const isValid = (devServerURL && devServerURL.startsWith(urlObj.origin)) || urlObj.protocol === 'file:'

      if (!isValid) {
        const type = await checkLinkType(url)
        if (type === 'download') return win.webContents.downloadURL(url) // Download
        return shell.openExternal(url) // Opened externally
      }

      const pageIdentifier = urlObj.pathname + urlObj.search + urlObj.hash
      loadPage(win, pageIdentifier) // Required for successful navigation relative to the root (e.g. "../..") 
    })


    Object.defineProperty(win, "__show", {
      get: () => flags.__show,
      set: (v) => {
        if (flags.__show === null) return // Lock set behavior
        flags.__show = v
      },
      configurable: false
    })

    ipcMain.once(`commoners:close:${__id}`, () => win.close())


    // ------------------------ Main Window Default Behaviors ------------------------
    if (isMainWindow) {
      ipcMain.once(`commoners:ready:${__id}`, () => {
        globals.mainWindow = win
        globals.firstInitialized = true
        readyQueue.forEach(f => f(win))
        readyQueue = []
      })

      // De-register the main window
      win.once('close', () => {
        globals.mainWindow = null
      })
    }

    // ------------------------ Default Quit Behavior ------------------------
    ipcMain.once('commoners:quit', () => app.quit())

    // ------------------------ Open Windows Externally ------------------------
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // ------------------------ Window Shutdown Behavior ------------------------
    win.once("close", async () => {
      await runWindowPlugins(win, 'unload', toIgnore)
      __listeners.forEach((l) => l.remove()) // Clear listeners attached to the window. These are created using the ipcMain.on proxy
    })

    // ------------------------ Window Load Behavior ------------------------
    win.__ready = new Promise(resolve => ipcMain.once(`commoners:ready:${__id}`, () => resolve())) // Wait for the window to be ready to show

    // Asyncronously load plugins. Allow for accessing the load status of each plugin
    win.__loading = Object.keys(PLUGINS).reduce((acc, id) => {
      const listener = `commoners:loaded:${__id}:${id}`
      acc[id] = new Promise(resolve => ipcMain.once(listener, async () => resolve(await runWindowPlugin(win, id, 'load'))))
      return acc
    }, {}) // Asyncronously load plugins. Allow for accessing the load status of each plugin

    // Allow querying load state with exclusions
    win.__loaded = Promise.all(Object.values(win.__loading)).then(() => {})

    // ------------------------ Window Page Load Behavior ------------------------
    loadPage(win, page)

    // ------------------------ Window Creation Callback ------------------------
    if (onInitialized) onInitialized.call(electron, win) 

    // ------------------------ Show Window after Global Variables are Set ------------------------
    await new Promise(resolve => ipcMain.once(`commoners:ready:${__id}`, resolve)) // Commoners plugins are all loaded
    win.show()

    return win
  }

function getPageLocation(pathname: string = 'index.html', alt = false) {

    if (isDevServer) return new URL(pathname, devServerURL).href

    const isContained = normalizeAndCompare(pathname, __dirname, (a,b) => a.startsWith(b))

    // Check if dirname in the path
    const location = isContained ? pathname : join(__dirname, pathname)

    // Assume a file
    if (extname(location)) return location // Return if file extension is present

    const html = location + '.html' // Add .html extension if not present
    const index = join(location, 'index.html')

    if (existsSync(html)) return html // Return if .html file exists
    if (existsSync(index)) return index // Return if index.html file exists

    return alt ? html : index // NOTE: This is because we cannot check for existence in the .asar archive
}


async function createMainWindow() {
  const windows = BrowserWindow.getAllWindows()
  if (windows.find(o => o.__main)) return // Force only one main window
  return await createWindow(undefined, windowOptions, [], true)
}

const baseServiceOptions = { 
  target: 'desktop',
  build: isProduction,
  root: isProduction ? __dirname : join(__dirname, '..', '..'), // Back out of default outDir 
}

// ------------------------ App Start Behavior ------------------------
services.resolveAll(config.services, baseServiceOptions).then(async (resolvedServices) => {

  const hasCustomProtocol = !!protocolOptions.scheme
  if (hasCustomProtocol) {
    const { protocol } = electron
    protocol.registerSchemesAsPrivileged([ protocolOptions ])
  }
  
  await boundRunAppPlugins([ resolvedServices ])

  app.whenReady().then(async () => {

    // ------------------------ Service Creation ------------------------
    const output = await services.createAll(resolvedServices, {
      ...baseServiceOptions,
      onClosed: (id, code) => serviceSend(id, 'closed', code),
      onLog: (id, msg) => serviceSend(id, 'log', msg.toString())
    })

    const { active = {}, resolved = {}, close: closeService } = output

    ipcMain.on('commoners:services', (event) => event.returnValue = services.sanitize(resolved)) // Expose to renderer process (and ensure URLs are correct)

    // ------------------------Track Service Status in Windows ------------------------
    for (let id in resolved) {
      const isRemote = !(id in active)
      serviceOn(id, 'status', (event) => event.returnValue =isRemote ? 'remote' : active[id].status)
      serviceOn(id, 'close', () => isRemote || closeService(id))
    }


    if (hasCustomProtocol) { 
      const { scheme } = protocolOptions
      const { protocol, net } = electron
      app.setAppUserModelId(`com.${scheme}`)

      // console.log("Registered protocol", protocolOptions)
      
      protocol.handle(scheme, (req) => {

          const loadedURL = new URL(req.url)
          const { host, pathname, search, hash } = loadedURL
          const updatedPathname =  pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

          console.log(updatedPathname, host, search, hash)

          // Proxy the services through the custom protocol
          if (host === "services") {
            const splitPath = updatedPathname.split('/')
            const serviceId = splitPath[0]
            const resolvedPath = splitPath.slice(1).join('/') + search + hash
            const resolvedURL = new URL(resolvedPath, services[serviceId].url)
            if (services[host]) return net.fetch(resolvedURL.href)
            return new Response(`${resolvedPath} is not a valid request`, { status: 404 })
          }

          const resolvedPath = (host === 'pages' ? updatedPathname : ( updatedPathname ? `${host}${updatedPathname}` : host) + search + hash)
          loadPage(restoreWindow(), resolvedPath)

      })

    }

    // ------------------------ App Ready Behavior ------------------------
    await boundRunAppPlugins([ active ], 'ready') // Non-Window Load Behavior

    // --------------------- Main Window Creation ---------------------
    createMainWindow()
    app.on('activate', () => createMainWindow())
  })
})


app.on('ready', async () => {
  process.on("SIGINT", () => {
    globals.isShuttingDown = true
    process.exit(0)
  });
})

// ------------------------ Default Close Behavior ------------------------
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit()) // Quit when all windows are closed, except on macOS.

// ------------------------ App Shutdown Behavior ------------------------
app.on('before-quit', async (ev) => {
  ev.preventDefault()
  try { 
    await boundRunAppPlugins([], 'quit')
    services.close()
   } catch (err) { console.error(err); } finally { app.exit() } // Exit gracefully
});
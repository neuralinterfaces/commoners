import electron, { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, basename, extname, posix, sep } from 'node:path'
import * as utils from '@electron-toolkit/utils'

import * as services from '../services/index'
import { existsSync } from 'node:fs';
import { ElectronBrowserWindowFlags, ElectronWindowOptions, ExtendedElectronBrowserWindow } from '../../types';
import { runAppPlugins } from '../plugins';
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from '../utils/icons';
import { hasSignature, verifySignature } from './security';
import { createInterface } from 'node:readline';

import { session } from 'electron'

const decodePath = (path) => {
  const decoded = decodeURIComponent(path.replace(/\/+$/, '')); // Remove trailing slashes and decode
  return decoded.replaceAll(sep, posix.sep) // Normalize path separators for comparison
}

function normalizeAndCompare(path1, path2, comparison = (a,b) => a === b) {
  path1 = decodePath(path1)
  path2 = decodePath(path2)
  return comparison(path1, path2)
}

async function checkLinkType(url) {
  try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition && contentDisposition.includes('attachment')) return 'download'; // Download if attachment
      if (!response.headers.get('Content-Type').startsWith('text/html')) return 'unknown'; // Unknown if not HTML
      return 'webpage';
  } catch (error) { return 'unknown' }
}

// Custom Window Flags
// __main: Is Main Window
// __show: Used to block show behavior

const chalk = import('chalk').then(m => m.default)

function send(this: BrowserWindow, channel: string, ...args: any[]) {
  try {
    return this.webContents.send(channel, ...args)
  } catch (e) { } // Catch in case messages are registered as sendable for a window that has been closed
}

type ReadyFunction = (win: BrowserWindow) => any
let readyQueue: ReadyFunction[] = []

const onNextWindowReady = (f: ReadyFunction) => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return readyQueue.push(f) // No windows yet
  windows.forEach(win => f(win)) // Call immediately if windows already exist
}

const getScopedIdentifier = (type, source, attr) => `${type}:${source}:${attr}`

const scopedOn = (type, id, channel, callback) => {
  const event = getScopedIdentifier(type, id, channel)
  ipcMain.on(event, callback)
  const remove = () => ipcMain.removeListener(event, callback)
  return { 
    remove // A helper function to remove the listener
   } 
}

const scopedHandle = (type, id, channel, callback) => {
  const event = getScopedIdentifier(type, id, channel)
  ipcMain.handle(event, callback)
  const remove = () => ipcMain.removeHandler(event)
  return {
    remove // A helper function to remove the handler
  } 
}

const scopedSend = (type, id, channel, ...args) => {
  const windows = BrowserWindow.getAllWindows()
  const event = getScopedIdentifier(type, id, channel)
  windows.forEach(win => send.call(win, event, ...args)) // Send to all windows
}



const serviceSend = (id, channel, ...args) => scopedSend('services', id, channel, ...args)
const serviceOn = (id, channel, callback) => scopedOn('services', id, channel, callback)

const pluginSend = (pluginName, channel, ...args) => scopedSend('plugins', pluginName, channel, ...args)
const pluginOn = (pluginName, channel, callback) => scopedOn('plugins', pluginName, channel, callback)
const pluginHandle = (pluginName, channel, callback) => scopedHandle('plugins', pluginName, channel, callback)

const globals: {
  firstInitialized: boolean,
  mainWindow: BrowserWindow | null,
  quitMessage: string | null,
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
  plugins: {},
  quitMessage: null
}

// Transfer all the main console commands to the browser
const ogConsoleMethods: any = {};
['log', 'warn', 'error'].forEach(method => {
  const ogMethod = ogConsoleMethods[method] = console[method]
  console[method] = (...args) => {
    onNextWindowReady(win => send.call(win, `commoners:console.${method}`, ...args))
    ogMethod(...args)
  }
})

const isProduction = !utils.is.dev
const ASSET_ROOT_DIR = __dirname
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const PROJECT_ROOT_DIR = isProduction ? ASSET_ROOT_DIR : process.cwd() // CWD is the project root in development
const viteAssetsPath = join(ASSET_ROOT_DIR, 'assets')

globalThis.COMMONERS_QUIT = (message?: string) => {
  globals.quitMessage = message || null // Store the quit message
  app.quit() // Quit the application
}

process.on('uncaughtException', (err) => {

  if (err.code === 'EPIPE') return // Ignore EPIPE errors. These often occur when using console.log during a plugins's quit() method, but only if Ctrl+C is pressed

  electron.dialog.showErrorBox(
    'Uncaught Commoners Error',
    `${err.message}\n\n${err.stack}`
  )

})


// Populate platform variable if it doesn't exist
const platform = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')
const isWindows = platform === 'windows'
const isLinux = platform === 'linux'

// Get the Commoners configuration file
const configPath = join(viteAssetsPath, 'commoners.config.cjs') // Load the .cjs config version

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
    handle: function (channel, callback, win?: BrowserWindow){
      const listener = pluginHandle(this.id, channel, callback)
      if (win) win.__listeners.push(listener) // Store the listener in the window
      return listener
    },
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
        if ( !isProduction || isHTML ) acc[key] = src
        else acc[key] = join(viteAssetsPath, 'plugins', id, key, filename)
        return acc
      }, {})
    }
  }
  return acc
}, {})


const boundRunAppPlugins = runAppPlugins.bind({
  env: { WEB: false, DESKTOP: true, MOBILE: false, TARGET: "electron", DEV: !isProduction, PROD: isProduction },
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
    
    const result = await thisPlugin.call(context, win, id)
    return result
}

const runWindowPlugins = async (win: BrowserWindow | null = null, type = 'load', toIgnore: string[] = []) => {
  return await Promise.all(Object.keys(PLUGINS).map(async (id) => {
    if (toIgnore.includes(id)) return
    return runWindowPlugin(win, id, type)
  }))
}

  // ------------------- Configure the main window properties -------------------  
  const preload = join(ASSET_ROOT_DIR, 'preload.cjs')

  const defaultIcon = getIcon(config.icon, {
    preferredFormats: isWindows ? ELECTRON_WINDOWS_PREFERENCE : ELECTRON_PREFERENCE
  })

  const linuxIcon = defaultIcon // config.icon?.linux || defaultIcon

  const platformDependentWindowConfig = (isLinux && linuxIcon) ? { icon: linuxIcon } : {}

  const electronOptions = config.electron ?? {}
  const protocolOptions = electronOptions.protocol ? ( typeof electronOptions.protocol === 'string' ? { scheme: electronOptions.protocol } : electronOptions.protocol ) : {}
  const windowOptions = electronOptions.window ?? {}
  const applyDefaultSecuritySettings = electronOptions.secure !== false // Default to true if not explicitly set to false
  // if (applyDefaultSecuritySettings) app.enableSandbox() // Enable sandboxing if not explicitly disabled

  // Aggregate window options on plugins
  Object.entries(PLUGINS).forEach(([ id, plugin ]) => {
    const { desktop: { mainWindowOverrides } = {} } = plugin
    if (!mainWindowOverrides) return
    Object.assign(windowOptions, mainWindowOverrides)
  })

  const defaultWindowConfig = {
    autoHideMenuBar: true,
    ...platformDependentWindowConfig,
  }


  let windowCount = 0

  // ------------------------ Window Page Load Behavior ------------------------
  const loadPage = async (win, page) => {

      if (isValidUrl(page)) {
        win.loadURL(page)
        return page
      }

      const location = getPageLocation(page)

      try {
        new URL(location) // test if the URL is valid
        win.loadURL(location)
        return location
      } catch {}
  
      // NOTE: Catching the alternative location results in a delay depending on load time
      const loadFile = (location) => win.loadURL(`file://${location}`)

      const result = await loadFile(location)
      .then(() => location)
      .catch(() => {
        const location = getPageLocation(page, true)
        loadFile(location) // Try loading the file with an alt path
        return location
      })
      
      return result
}

  const isValidUrl = (url) => {
    try {
      new URL(url)
      return true
    } catch (e) {
      return false
    }
  }

  const isCommonersAsset = (location) => {
    if (isValidUrl(location)) return isCommonersUrl(location) // Check if it's a file URL
    else {
      const normalizedPath = decodePath(location)
      return normalizeAndCompare(normalizedPath, ASSET_ROOT_DIR, (a, b) => a.startsWith(b)) // Check if the path starts with the root directory
    }
  }

  const isCommonersUrl = (url) => {
    try {
      const urlObj = new URL(url)
      return (DEV_SERVER_URL && DEV_SERVER_URL.startsWith(urlObj.origin)) || urlObj.protocol === 'file:'
    }
    catch (e) {
      return false
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

    // Attempt to sandbox the window unless explicitly disabled
    
    if (applyDefaultSecuritySettings) copy.webPreferences = { 
      contextIsolation: true, // Enable context isolation by default
      sandbox: true, // Enable sandboxing by default
      nodeIntegration: false,  // Disable Node.js integration by default
      devTools: !isProduction, // Disable devTools in production
      ...copy.webPreferences // Override with any existing webPreferences
    }


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

    win.webContents.on('did-fail-load', (e, errorCode, errorDesc) => {
      console.error(`[LOAD FAIL] ${errorCode}: ${errorDesc}`)
    })
    
    win.webContents.on('crashed', () => {
      console.error('[RENDERER CRASHED]')
    })
    

    const { devTools } = copy.webPreferences ?? {}
    if (applyDefaultSecuritySettings && devTools === false) win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());

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



    const __location = {
      search: undefined,
      hash: undefined,
    }
    

    // Catch all navigation events
    win.webContents.on('will-navigate', async (event, url) => {

      event.preventDefault()
      
      const urlObj = new URL(url)

      if (!isCommonersUrl(url)) {
        const type = await checkLinkType(url)
        if (type === 'download') return win.webContents.downloadURL(url) // Download
        if (isMainWindow) return shell.openExternal(url) // Only open externally if main window
        else return win.loadURL(url) // Otherwise just load URL in the window (e.g. for PDFs)
      }
      
      __location.search = urlObj.search
      __location.hash = urlObj.hash
      await loadPage(win, urlObj.pathname) // Required for successful navigation relative to the root (e.g. "../..") 

      // // NOTE: This does not work when using loadFile
      // const pageIdentifier = urlObj.pathname + urlObj.search + urlObj.hash
      // loadPage(win, pageIdentifier) // Required for successful navigation relative to the root (e.g. "../..") 
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

    ipcMain.on(`commoners:location:${__id}`, (event) => event.returnValue = __location)


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
    ipcMain.once('commoners:quit', (_, message) => globalThis.COMMONERS_QUIT(message))

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

    // Synchronously run all plugin load callbacks
    const called = Object.keys(PLUGINS).reduce((acc, id) => {
      acc[id] = runWindowPlugin(win, id, 'load') // Possible promise
      return acc
    }, {}) 

    // Then asyncronously load the plugin results. Allow for accessing the load status of each plugin
    win.__loading = Object.entries(called).reduce((acc, [ id, promise ]) => {
      const listener = `commoners:loaded:${__id}:${id}`
      acc[id] = new Promise(resolve => ipcMain.once(listener, async () => resolve(await promise)))
      return acc
    }, {})

    // Allow querying load state with exclusions
    win.__loaded = Promise.all(Object.values(win.__loading)).then(() => {})

    // ------------------------ Window Page Load Behavior ------------------------
    const loadPromise = loadPage(win, page)

    // ------------------------ Window Creation Callback ------------------------
    if (onInitialized) onInitialized.call(electron, win) 
      
    // ------------------------ Show Window after Global Variables are Set ------------------------
    await loadPromise.then(async (location) => {
      const isAsset = isCommonersAsset(location)

      // Load all commoners plugins before showing the asset window
      if (isAsset) await new Promise(resolve => {
        const readyChannel = `commoners:ready:${__id}`
        ipcMain.once(readyChannel, () => resolve(true))
        send.call(win, readyChannel) // Notify the main process that the window is loading
      }) 

      // Or just wait for the window to be ready to show
      else await new Promise(resolve => {
        const isReadyToShow = win.__ready
        if (isReadyToShow) return resolve(true) // Already ready to show
        else win.once('ready-to-show', () => resolve(true))
      })

    })
    .finally(() => win.show())

    return win
  }

function getPageLocation(pathname: string = 'index.html', alt = false) {
    
    if (DEV_SERVER_URL) return new URL(pathname, DEV_SERVER_URL).href

    pathname = pathname.startsWith('/') && isWindows ? pathname.slice(1) : pathname // Remove leading slash on Windows

    const isContained = normalizeAndCompare(pathname, ASSET_ROOT_DIR, (a,b) => a.startsWith(b))

    // Check if dirname in the path
    const location = isContained ? pathname : join(ASSET_ROOT_DIR, pathname)

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

const baseServiceOptions = { target: 'desktop',  build: isProduction, root: PROJECT_ROOT_DIR }

const hasCustomProtocol = !!protocolOptions.scheme
if (hasCustomProtocol) {
  const { protocol } = electron
  protocol.registerSchemesAsPrivileged([ protocolOptions ])
}

if (config.name) app.setName(config.name);

services.resolveAll(config.services, baseServiceOptions).then(async (resolvedServices) => {

  await boundRunAppPlugins([ resolvedServices ]) // Run plugins on start with resolved services

  app.whenReady().then(async () => {

  

    // Verify that the application integrity is intact when running in production
    if (isProduction) {
      const signatureExists = await hasSignature() // Check if the application has a valid signature
      if (signatureExists) {
        const isValid = await verifySignature() // Perform the executable signature check

        if (!isValid) {
          const messageBase = `This application has an invalid signature, which indicates a security issue or corruption.`
          electron.dialog.showErrorBox(
            `${app.getName()} Integrity Check Failed`,
            `${messageBase}\n\nPlease contact support or reinstall the application.`
          ) 

          globalThis.COMMONERS_QUIT(messageBase) // Exit with error message
          return
        }
      }

      else console.warn(`⚠️  ${app.getName()} does not appear to be signed. Please ensure that the application is intentionally unsigned.`)
    }

    // session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    //   console.log(`[CSP] Headers received for ${details.url}`)
    //   callback({
    //     responseHeaders: {
    //       ...details.responseHeaders
    //     }
    //   })
    // })    

    // ------------------------ STDIN Commands ------------------------

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout, // optional
      terminal: false
    })

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line.trim())
        const { command, data } = msg
        if (command === 'reload') {
          const { frontend, service } = data || {}
          if (frontend) BrowserWindow.getAllWindows().forEach(win => !win.isDestroyed() && win.webContents.reload())
          if (service) console.warn('Service reloads are not yet implemented in the Electron main process.')
        }
      }
      catch {}
    })

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
  const signals = [ 'SIGTERM', 'SIGINT' ]
  signals.forEach(signal => {
    process.on(signal, () => {
      globals.isShuttingDown = true 
      const message = `Received ${signal}. Shutting down gracefully...`
      globalThis.COMMONERS_QUIT(message) // Handle signals gracefully
    });
  })
})

// ------------------------ Default Close Behavior ------------------------
app.on('window-all-closed', () => platform !== 'mac' && globalThis.COMMONERS_QUIT("All windows have been closed.")) // Quit when all windows are closed, except on macOS.

// ------------------------ App Shutdown Behavior ------------------------
app.on('before-quit', async (ev) => {
  ev.preventDefault()
  globals.isShuttingDown = true // Set the shutdown state
  try { 
    await boundRunAppPlugins([ globals.quitMessage ], 'quit') // Run plugins on quit
    services.close()
   } 
   catch (err) { console.error(err); } 
   finally { app.exit() } // Exit gracefully
});
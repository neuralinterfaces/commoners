import electron, { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, basename } from 'node:path'
import * as utils from '@electron-toolkit/utils'

import * as services from '../services/index'

// Custom Window Flags
// __main: Is Main Window
// __show: Used to block show behavior

type WindowOptions = Electron.BrowserWindowConstructorOptions

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
  }
} = {
  firstInitialized: false,
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
    console.log(_chalk.yellow('Another instance of this application is already running.'))
    app.exit(); // Skip quit callbacks
  }
  else app.on("second-instance", () => restoreWindow());
}

makeSingleInstance();

const _config = require(configPath) // Requires putting the dist at the Resource Path
const config = _config.default || _config

const plugins = config.plugins ?? {}

// Precreate contexts to track custom properties 
const contexts = Object.entries(plugins).reduce((acc, [ id, plugin ]) => {

  const { assets = {} } = plugin

  acc[id] = { 
    id,

    // Packaged Electron Utilities
    electron,
    utils,

    // Helper Functions
    createWindow: (page: string, opts: WindowOptions) => createWindow(page, opts),
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
      assets: Object.entries(assets).reduce((acc, [key, value]) => {
        const filepath = typeof value === 'string' ? value : value.src
        const filename = basename(filepath)
        acc[key] = join(assetsPath, 'plugins', id, key, filename)
        return acc
      }, {})
    }
  }
  return acc
}, {})

const runAppPlugins = async (args: any[] = [], type = 'start') => {
  return await Promise.all(Object.entries(plugins).map(([id, plugin]: [string, any]) => {
    const desktopState = plugin.desktop ?? {}

    const types = {
      start: type === "start",
      ready: type === "ready",
      end: type === "end"
    }

    // Coordinate the state transitions for the plugins
    const { __state } = desktopState
    if (types.start && __state) return
    if (types.ready && __state !== "start") return
    desktopState.__state = type

    const thisPlugin = desktopState[type]
    if (!thisPlugin) return
    
    return thisPlugin.call(contexts[id], ...args)

  }))

}


const runWindowPlugins = async (win: BrowserWindow | null = null, type = 'load', toIgnore: string[] = []) => {
  return await Promise.all(Object.entries(plugins).map(async ([id, plugin]: [string, any]) => {

    if (toIgnore.includes(id)) return
    const desktopState = plugin.desktop ?? {}

    const types = {
      load: type === "load",
      unload: type === "unload"
    }

    // Coordinate the state transitions for the plugins
    const thisPlugin = desktopState[type]
    if (!thisPlugin) return

    const context = contexts[id]
    
    const { on, createWindow } = context

    if (types.load) {
      context.createWindow = (page, opts) => createWindow(page, opts, [ id ]) // Do not recursively call window creation in load function
    }
    
    const result = await thisPlugin.call(context, win)

    if (types.load) {
      context.on = on
      context.createWindow = createWindow
    }

    return result

  }))
}

  // ------------------- Configure the main window properties -------------------  
  const preload = join(__dirname, 'preload.js')

  // Replace with getIcon (?)
  const defaultIcon = config.icon && (typeof config.icon === 'string' ? config.icon : Object.values(config.icon).find(str => typeof str === 'string'))
  const linuxIcon = config.icon?.linux || defaultIcon

  const platformDependentWindowConfig = (platform === 'linux' && linuxIcon) ? { icon: linuxIcon } : {}

  const electronOptions = config.electron ?? {}
  const windowOptions = electronOptions.window ?? {}

  const defaultWindowConfig = {
    autoHideMenuBar: true,
    webPreferences: { sandbox: false },
    ...platformDependentWindowConfig,
  }


  let windowCount = 0

  async function createWindow (page, options: WindowOptions = {}, toIgnore?: string[], isMainWindow: boolean = false) {

    const copy = structuredClone({...defaultWindowConfig, ...options})
    
    // Ensure web preferences exist
    if (!copy.webPreferences) copy.webPreferences = {}
    if (!('preload' in copy.webPreferences)) copy.webPreferences.preload = preload // Provide preload script if not otherwise specified
    if (!('additionalArguments' in copy.webPreferences)) copy.webPreferences.additionalArguments = []


    const __listeners = []
    const flags = {
      __id: windowCount,
      __main: isMainWindow,
      __show: true,
      __listeners
    }

    windowCount++

    copy.webPreferences.additionalArguments.push(...Object.entries(flags).map(([key, value]) => `--${key}=${value}`))

    const win = new BrowserWindow({ ...copy, show: false }) // Always initially hide the window
    Object.assign(win, flags)
    
    const ogShow = win.show
    win.show = function (){
      if (win.__show === false) return
      return ogShow.call(this) // Keep the window hidden if testing
    }

    // ------------------------ Main Window Default Behaviors ------------------------
    if (isMainWindow) {
      ipcMain.once('commoners:ready', () => {
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
    await runWindowPlugins(win, 'load', toIgnore) 

    // ------------------------ Window Page Load Behavior ------------------------
    try {
      new URL(page)
      win.loadURL(page)
    }

    catch {
      win.loadFile(page)
    }

    await new Promise(resolve => win.once('ready-to-show', resolve)) // Show after plugin loading

    win.show() // Allow annotating to skip show

    return win
  }


async function createMainWindow() {
  const windows = BrowserWindow.getAllWindows()
  if (windows.find(o => o.__main)) return // Force only one main window
  const pageToRender = utils.is.dev && devServerURL ? devServerURL : join(__dirname, 'index.html')
  return await createWindow(pageToRender, windowOptions, [], true)
}

// ------------------------ App Start Behavior ------------------------
runAppPlugins().then(() => {

  app.whenReady().then(async () => {

    // ------------------------ Service Creation ------------------------
    const { active } = await services.createAll(config.services, {
      target: 'desktop', 
      build: isProduction,
      root: isProduction ? __dirname : join(__dirname, '..', '..'), // Back out of default outDir
      onClosed: (id, code) => serviceSend(id, 'closed', code),
      onLog: (id, msg) => serviceSend(id, 'log', msg.toString()),
    })

    // ------------------------Track Service Status in Windows ------------------------
    if (active) {
      for (let id in active) serviceOn(id, 'status', (event) => event.returnValue = active[id].status)
      ipcMain.on('commoners:services', (event) => event.returnValue = services.sanitize(active)) // Expose to renderer process (and ensure URLs are correct)
    }

    // ------------------------ App Ready Behavior ------------------------
    await runAppPlugins([ active ], 'ready') // Non-Window Load Behavior

    // --------------------- Main Window Creation ---------------------
    createMainWindow()
    app.on('activate', () => createMainWindow())
  })
})

// ------------------------ Default Close Behavior ------------------------
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit()) // Quit when all windows are closed, except on macOS.

// ------------------------ App Shutdown Behavior ------------------------
app.on('before-quit', async (ev) => {
  ev.preventDefault()
  try { 
    await runAppPlugins([], 'quit')
    services.close()
   } catch (err) { console.error(err); } finally { app.exit() } // Exit gracefully
});
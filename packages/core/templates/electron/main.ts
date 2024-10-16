// --------------------------------------------------------------------------------------------------------------
// For a more basic Electron example, see: https://github.com/electron/electron-quick-start/blob/main/main.js
// --------------------------------------------------------------------------------------------------------------

import electron, { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join, basename } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import * as services from '../services/index'

const assetsPath = join(__dirname, 'assets')

const chalk = import('chalk').then(m => m.default)

let mainWindow;

function send(this: BrowserWindow, channel: string, ...args: any[]) {
  try {
    return this.webContents.send(channel, ...args)
  } catch (e) { } // Catch in case messages are registered as sendable for a window that has been closed
}

type ReadyFunction = (win: BrowserWindow) => any
let readyQueue: ReadyFunction[] = []

const onWindowReady = (f: ReadyFunction) => mainWindow ? f(mainWindow) : readyQueue.push(f)

const scopedOn = (type, id, channel, callback) => {
  const event = `${type}:${id}:${channel}`
  ipcMain.on(event, callback)
  const remove = () => ipcMain.removeListener(event, callback)
  return { 
    remove // A helper function to remove the listener
   } 
}

const scopedSend = (type, id, channel, ...args) => onWindowReady(() => {
  const allWindows = BrowserWindow.getAllWindows()
  allWindows.forEach(win => send.call(win, `${type}:${id}:${channel}`, ...args)) // Send to all windows
})
const serviceSend = (id, channel, ...args) => scopedSend('services', id, channel, ...args)
const serviceOn = (id, channel, callback) => scopedOn('services', id, channel, callback)

const pluginSend = (pluginName, channel, ...args) => scopedSend('plugins', pluginName, channel, ...args)
const pluginOn = (pluginName, channel, callback) => scopedOn('plugins', pluginName, channel, callback)

const globals: {
  isFirstOpen: boolean,
  firstInitialized: boolean,
  splash?: BrowserWindow
} = {
  firstInitialized: false,
  isFirstOpen: true
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

// import chalk from 'chalk'
// import util from 'node:util'

// // --------------------- Simple Log Script ------------------------
// import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
// const homeDirectory = app.getPath("home");
// const commonersDirectory = join(homeDirectory, 'commoners');
// if (!existsSync(commonersDirectory)) mkdirSync(commonersDirectory)

// const uniqueLogId = (new Date()).toUTCString()
// const writeToDebugLog = (msg) => {
//   appendFileSync(join(commonersDirectory, `${app.name}_${uniqueLogId}.log`), `${msg}\n`)
// }

const devServerURL = process.env.VITE_DEV_SERVER_URL
const isProduction = !devServerURL

// Enable remote debugging port for Vitest
const IS_TESTING = process.env.VITEST
if (IS_TESTING) {
  app.commandLine.appendSwitch('remote-debugging-port', `${8315}`) // Mirrors the global electronDebugPort variable
  app.commandLine.appendSwitch('remote-allow-origins', '*') // Allow all remote origins
}

const showWindow = (win) => {
  if (!IS_TESTING) win.show()
}

// Populate platform variable if it doesn't exist
const platform = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

// Get the Commoners configuration file
const configPath = join(assetsPath, 'commoners.config.cjs') // Load the .cjs config version

// --------------- App Window Management ---------------
function restoreWindow() {
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
    electron,
    createWindow,
    open: () => app.whenReady().then(() => globals.firstInitialized && (restoreWindow() || createMainWindow(config))),
    send: function (channel, ...args) { return pluginSend(this.id, channel, ...args) },
    on: function (channel, callback) { return pluginOn(this.id, channel, callback) },

    // Provide specific variables from the plugin
    plugin: {
      assets: Object.entries(assets).reduce((acc, [key, value]) => {
        const filepath = typeof value === 'string' ? value : value.src
        const filename = basename(filepath)
        acc[key] = join(assetsPath, 'plugins', id, key, filename)
        return acc
      }, {})
    },
  }
  return acc
}, {})

const runPlugins = async (win: BrowserWindow | null = null, type = 'load') => {
  return await Promise.all(Object.entries(plugins).map(([id, plugin]: [string, any]) => plugin.desktop?.[type] && plugin.desktop[type].call(contexts[id], win)))
}



  // ------------------- Configure the main window properties -------------------  
  const preload = join(__dirname, 'preload.js')

  // Replace with getIcon (?)
  const defaultIcon = config.icon && (typeof config.icon === 'string' ? config.icon : Object.values(config.icon).find(str => typeof str === 'string'))
  const linuxIcon = config.icon?.linux || defaultIcon

  const platformDependentWindowConfig = (platform === 'linux' && linuxIcon) ? { icon: linuxIcon } : {}

  const mainWindowOpts = config.electron ?? {}

  const defaultWindowConfig = {
    autoHideMenuBar: true,
    webPreferences: { sandbox: false },
  }

  const mainWindowConfig = {
    show: false,
    ...platformDependentWindowConfig,
    ...mainWindowOpts.window ?? {} // Merge User-Defined Window Variables
  }

  function createWindow (options = {}) {
    const copy = structuredClone({...defaultWindowConfig, ...options})
    
    // Ensure web preferences exist
    if (!copy.webPreferences) copy.webPreferences = {}
    if (!('preload' in copy.webPreferences)) copy.webPreferences.preload = preload // Provide preload script if not otherwise specified
    copy.webPreferences.enableRemoteModule = true // Always enable remote module

    // Hide the window if testing
    if (IS_TESTING) copy.show = false

    const win = new BrowserWindow(copy)

    return win
  }


function createMainWindow(config) {
  
  // ------------------- Force only one main window -------------------
  if (BrowserWindow.getAllWindows().length !== 0) return

  // ------------------- Avoid window creation if the user has specified not to -------------------
  const windowOpts = mainWindowOpts.window
  const noWindowCreation = windowOpts === false || windowOpts === null
  if (noWindowCreation) return runPlugins() // Just create the backend plugins

  const splashURL = mainWindowOpts.splash

  if (splashURL) {
    const splash = new BrowserWindow({
      width: 340,
      height: 340,
      frame: false,
      ...platformDependentWindowConfig,
      alwaysOnTop: true,
      transparent: true,
      show: !IS_TESTING // Hide the window if testing
    });

    const completeSplashPath = join(assetsPath, splashURL)

    splash.loadFile(completeSplashPath)


    globals.splash = splash // Replace splash entry with the active window
  }

  // Create the browser window.
  const win = createWindow(mainWindowConfig)

  // Activate specified plugins from the configuration file
  runPlugins(win)


  // Is ready to receive IPC messages
  ipcMain.on('commoners:ready', () => {
    mainWindow = win
    globals.firstInitialized = true
    readyQueue.forEach(f => f(win))
    readyQueue = []
  })

  ipcMain.on('commoners:quit', () => app.quit())


  win.on('ready-to-show', () => {

    if (globals.splash) {
      setTimeout(() => {
        if (globals.splash) {
          globals.splash.close();
          delete globals.splash
        }

        showWindow(win)

        globals.isFirstOpen = false
      }, globals.isFirstOpen ? 1000 : 200);
    }

    else showWindow(win)

  })

  // De-register the main window
  win.once('close', () => {
    mainWindow = undefined
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // HMR for renderer base on commoners cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && devServerURL) win.loadURL(devServerURL)
  else win.loadFile(join(__dirname, 'index.html'))

  return win
}

// Custom Protocol Support (https://www.electronjs.org/docs/latest/api/protocol#protocolregisterschemesasprivilegedcustomschemes)
const customProtocolScheme = app.name.toLowerCase().split(' ').join('-')
protocol.registerSchemesAsPrivileged([{
  scheme: customProtocolScheme,
  privileges: { supportFetchAPI: true }
}])

// This method will be called when Electron has initialized
runPlugins(null, 'preload').then(() => {

  app.whenReady().then(async () => {

    // Set app user model id for windows
    electronApp.setAppUserModelId(`com.${customProtocolScheme}`)

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Create all services as configured by the user / main build
    // NOTE: Services cannot be filtered in desktop mode   
    const { active } = await services.createAll(config.services, {
      target: 'desktop', 
      build: isProduction,
      root: isProduction ? __dirname : join(__dirname, '..', '..'), // Back out of default outDir
      onClosed: (id, code) => serviceSend(id, 'closed', code),
      onLog: (id, msg) => serviceSend(id, 'log', msg.toString()),
    })

    if (active) {
      for (let id in active) serviceOn(id, 'status', (event) => event.returnValue = active[id].status)
      ipcMain.on('commoners:services', (event) => event.returnValue = services.sanitize(active)) // Expose to renderer process (and ensure URLs are correct)
    }

    // Proxy the services through the custom protocol
    protocol.handle(customProtocolScheme, (req) => {

      const pathname = req.url.slice(`${customProtocolScheme}://`.length)

      if (active) {
        for (let service in active) {
          if (pathname.slice(0, service.length) === service) {
            const newPathname = pathname.slice(service.length)
            return net.fetch((new URL(newPathname, active[service].url)).href)
          }
        }
      }

      return new Response(`${pathname} is not a valid request`, {
        status: 404
      })
    })

    // Start the application from scratch
    createMainWindow(config)
    app.on('activate', () => createMainWindow(config)) // Handle dock interactions
  })

})


// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())

app.on('before-quit', async (ev) => {
  ev.preventDefault()

  const result = await runPlugins(null, 'unload')
  if (result.includes(false)) return

  try { services.close() } catch (err) { console.error(err); } finally { app.exit() } // Exit gracefully
});
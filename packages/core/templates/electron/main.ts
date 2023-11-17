// --------------------------------------------------------------------------------------------------------------
// For a more basic Electron example, see: https://github.com/electron/electron-quick-start/blob/main/main.js
// --------------------------------------------------------------------------------------------------------------

import electron, { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import * as services from '../services/index'

import main from '@electron/remote/main';

import dotenv from 'dotenv'

process.env.COMMONERS_ELECTRON = true

let mainWindow;

function send(this: BrowserWindow, channel: string, ...args: any[]) {
  try {
    return this.webContents.send(channel, ...args)
  } catch (e) { } // Catch in case messages are registered as sendable for a window that has been closed
}

type ReadyFunction = (win: BrowserWindow) => any
let readyQueue: ReadyFunction[] = []

const onWindowReady = (f: ReadyFunction) => mainWindow ? f(mainWindow) : readyQueue.push(f)

const globals: {
  isFirstOpen: boolean,
  firstInitialized: boolean,
  mainInitialized: boolean,
  splash?: BrowserWindow,
  send: Function
} = {
  firstInitialized: false,
  isFirstOpen: true,
  mainInitialized: false,
  send: (channel, ...args) => onWindowReady((win) => send.call(win, channel, ...args))
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

// Populate platform variable if it doesn't exist
const platform = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

// const __dirnameUnpacked = __dirname.replace('app.asar', 'app.asar.unpacked')

if (isProduction) dotenv.config({ path: join(__dirname, '.env') }) // Load the .env file in production

// Get the Commoners configuration file
const configPath = join(__dirname, 'commoners.config.cjs') // Load the .cjs config version

// --------------- App Window Management ---------------
function restoreWindow() {
  if (mainWindow) mainWindow.isMinimized() ? mainWindow.restore() : mainWindow.focus();
  return mainWindow
}

function makeSingleInstance() {
  if (process.mas) return;
  if (!app.requestSingleInstanceLock()) app.exit(); // Skip quit callbacks
  else app.on("second-instance", () => restoreWindow());
}

makeSingleInstance();

const config = require(configPath).default // (await import (configPath)).default // // Requires putting the dist at the Resource Path:

const plugins = config.plugins ?? []

const baseLoadCtx = {

  electron,
  
  // Create / restore the main window if the app is ready
  open: () => app.whenReady().then(() => globals.firstInitialized && (restoreWindow() || createMainWindow(config))),

  // Safe send to the main window if it exists  
  send: (channel, ...args) => onWindowReady(win => send.call(win, channel, ...args)) 
}

const runPlugins = (win: BrowserWindow | null = null, type = 'load') => {

  let loadCtx: any = baseLoadCtx
  if (type === 'load') loadCtx = {
    ...baseLoadCtx,
    on: (channel, callback) => ipcMain.on(channel, callback),
  }

  return Promise.all(plugins.map(plugin => plugin.desktop?.[type] && plugin.desktop[type].call(loadCtx, win, globals)))
}



function createMainWindow(config, opts = config.electron ?? {}) {

  if (BrowserWindow.getAllWindows().length !== 0) return // Force only one main window

  // Replace with getIcon (?)
  const defaultIcon = config.icon && (typeof config.icon === 'string' ? config.icon : Object.values(config.icon).find(str => typeof str === 'string'))
  const linuxIcon = config.icon?.linux || defaultIcon

  const platformDependentWindowConfig = (platform === 'linux' && linuxIcon) ? { icon: linuxIcon } : {}

  const splashURL = opts.splash

  if (splashURL) {
    const splash = new BrowserWindow({
      width: 340,
      height: 340,
      frame: false,
      ...platformDependentWindowConfig,
      alwaysOnTop: true,
      transparent: true,
    });

    const completeSplashPath = join(__dirname, splashURL)
    splash.loadFile(completeSplashPath)

    globals.splash = splash // Replace splash entry with the active window
  }

  // ------------------- Avoid window creation if the user has specified not to -------------------
  const windowOpts = opts.window
  const noWindowCreation = windowOpts === false || windowOpts === null
  if (noWindowCreation) return runPlugins()

  // ------------------- Create the main window -------------------  
  const preload = join(__dirname, 'preload.js')

  const windowConfig = {
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...platformDependentWindowConfig,
    webPreferences: {
      sandbox: false
    },
    ...opts.window ?? {} // Merge User-Defined Window Variables
  }

  // Ensure preload is added
  if (!('preload' in windowConfig.webPreferences)) windowConfig.webPreferences.preload = preload

  // Create the browser window.
  const win = new BrowserWindow(windowConfig)
  if (windowConfig.webPreferences.enableRemoteModule) {
    if (!globals.mainInitialized) {
      main.initialize()
      globals.mainInitialized = true
    }
    main.enable(win.webContents);
  }

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
        win.show();
        globals.isFirstOpen = false
      }, globals.isFirstOpen ? 1000 : 200);
    }

    else win.show()
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

runPlugins(null, 'preload')

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
    const resolved = await services.createAll(config.services, {
      mode: isProduction ? 'local' : undefined,
      base: __dirname,
      onClose: (id, code) => onWindowReady((win) => {
        send.call(win, `service:${id}:closed`, code)
      }),
      onLog: (id, msg) => onWindowReady((win) => {
        send.call(win, `service:${id}:log`, msg.toString())
      }),
    })

    if (resolved) {

      for (let id in resolved) {
        const service = resolved[id]
        ipcMain.on(`service:${id}:status`, (event) => event.returnValue = service.status)
      }

      process.env.COMMONERS_SERVICES = JSON.stringify(services.sanitize(resolved)) // Expose to renderer process (and ensure URLs are correct)
    }

    // Proxy the services through the custom protocol
    protocol.handle(customProtocolScheme, (req) => {

      const pathname = req.url.slice(`${customProtocolScheme}://`.length)

      if (resolved) {
        for (let service in resolved) {
          if (pathname.slice(0, service.length) === service) {
            const newPathname = pathname.slice(service.length)
            return net.fetch((new URL(newPathname, resolved[service].url)).href)
          }
        }
      }

      return new Response(`${pathname} is not a valid request`, {
        status: 404
      })
    })

    // Start the application from scratch
    await createMainWindow(config)
    app.on('activate', () => createMainWindow(config)) // Handle dock interactions
  })

})


// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())

app.on('before-quit', async (ev) => {
  ev.preventDefault()

  const result = await runPlugins(null, 'unload')
  if (result.includes(false)) return

  try { services.stop() } catch (err) { console.error(err); } finally { app.exit() }
});
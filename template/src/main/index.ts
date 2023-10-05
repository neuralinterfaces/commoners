
import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import * as services from './services/index'

import main from '@electron/remote/main';

// import chalk from 'chalk'
// import util from 'node:util'

// // --------------------- Simple Log Script ------------------------
// import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
// const homeDirectory = app.getPath("home");
// const commonersDirectory = join(homeDirectory, 'COMMONERS');
// if (!existsSync(commonersDirectory)) mkdirSync(commonersDirectory)

// const uniqueLogId = (new Date()).toUTCString()
// const writeToDebugLog = (msg) => {
//   appendFileSync(join(commonersDirectory, `${app.name}_${uniqueLogId}.log`), `${msg}\n`)
// }

const devServerURL = process.env.VITE_DEV_SERVER_URL
const isProduction = !devServerURL

// Populate platform variable if it doesn't exist
if (!process.env.PLATFORM)  process.env.PLATFORM = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

const commonersDist = (process.env.PLATFORM === 'windows' || !isProduction) ? join(__dirname, '..') : join(process.resourcesPath, 'dist', '.commoners') // NOTE: __dirname will be resolved since this is going to be transpiled into CommonJS
const commonersAssets = join(commonersDist, 'assets')
const dist = join(commonersDist, '..') 

// Get the COMMONERS configuration file
const configFileName = 'commoners.config.mjs'
const configPath = join(commonersAssets, configFileName)

// Populate other global variables if they don't exist
if (!process.env.TARGET) process.env.TARGET = 'desktop'
if (!process.env.MODE)  process.env.MODE = isProduction ? 'local' : 'development'; // NOTE: Could be remote

let mainWindow;

function send(this: BrowserWindow, channel: string, ...args: any[]) {
  return this.webContents.send(channel, ...args)
}

type ReadyFunction = (win: BrowserWindow) => any
let readyQueue: ReadyFunction[] = []
const onWindowReady = (f: ReadyFunction) => (globals.mainWindow) ? f(globals.mainWindow) : readyQueue.push(f)


const globals : {
  firstOpen: boolean,
  mainInitialized: boolean,
  mainWindow?: BrowserWindow
  splash?: BrowserWindow,
  userRestarted: boolean
} = {
  firstOpen: true,
  mainInitialized: false,
  get mainWindow(){
    return mainWindow
  },
  set mainWindow(v) {
    mainWindow = v
    if (v) readyQueue.forEach(f => onWindowReady(f))
    readyQueue = []
  },
  userRestarted: false,
}

function createAppWindows(config) {


// Replace with getIcon (?)
const defaultIcon = config.icon && (typeof config.icon === 'string' ? config.icon : Object.values(config.icon).find(str => typeof str === 'string'))
const linuxIcon = config.icon?.linux || defaultIcon


const platformDependentWindowConfig = (process.env.PLATFORM === 'linux' && linuxIcon) ? { icon: linuxIcon } : {}


  const splashURL = config.electron?.splash

  if (splashURL) {
    const splash = new BrowserWindow({
      width: 340,
      height: 340,
      frame: false,
      ...platformDependentWindowConfig,
      alwaysOnTop: true,
      transparent: true,
    });

    const completeSplashPath = join(commonersAssets, splashURL)
    splash.loadFile(completeSplashPath)

    globals.splash = splash // Replace splash entry with the active window
  }


  const preload = join(commonersDist, 'preload', 'index.js')

  const windowConfig = {
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...platformDependentWindowConfig,
    webPreferences: {
      sandbox: false
    },
    ...config.electron?.window ?? {} // Merge User-Defined Window Variables
  }

  // Ensure preload is added
  if (!('preload' in windowConfig.webPreferences)) windowConfig.webPreferences.preload = preload

  // Create the browser window.
  const mainWindow = new BrowserWindow(windowConfig)
  if (windowConfig.webPreferences.enableRemoteModule) {
    if (!globals.mainInitialized) {
      main.initialize()
      globals.mainInitialized = true
    }
    main.enable(mainWindow.webContents);
  }

  // Activate specified plugins from the configuration file
  if ('plugins' in config) config.plugins.forEach(plugin => (plugin.main) ? plugin.main.call(ipcMain, mainWindow, globals) : '' )

  mainWindow.on('ready-to-show', () => {

    globals.mainWindow = mainWindow

    if (globals.splash) {
      setTimeout(() => {
        if (globals.splash) {
          globals.splash.close();
          delete globals.splash
        }
        mainWindow.show();
        globals.firstOpen = false
      }, globals.firstOpen ? 1000 : 200);
     } 
     
     else mainWindow.show()

  })

  mainWindow.once('close', () => globals.mainWindow = undefined) // De-register the main window

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // HMR for renderer base on commoners cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && devServerURL) mainWindow.loadURL(devServerURL) 
  else mainWindow.loadFile(join(dist, 'index.html'))

  return mainWindow
}

// Custom Protocol Support (https://www.electronjs.org/docs/latest/api/protocol#protocolregisterschemesasprivilegedcustomschemes)
const customProtocolScheme = app.name.toLowerCase().replaceAll(' ', '-')
protocol.registerSchemesAsPrivileged([{
  scheme: customProtocolScheme,
  privileges: { supportFetchAPI: true }
}])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {

  const config = (await import(configPath)).default // Requires putting the dist at the Resource Path: https://github.com/electron/electron/issues/38957

  // // Pass preconfigured properties to the main service declaration
  // const { SERVICES } = process.env
  // if (SERVICES) {
  //   const preconfigured = JSON.parse(SERVICES as string)
  //   for (let id in preconfigured) {
  //     if (typeof config.services[id] === 'string') config.services[id] = { src: config.services[id] }
  //     config.services[id] = Object.assign(config.services[id], preconfigured[id])
  //   }
  // }

  // Set app user model id for windows
  electronApp.setAppUserModelId(`com.${customProtocolScheme}`)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await services.createAll(config.services, { assets: commonersAssets, root: join(dist, '..')  }) // Create all services as configured by the user / main build

  // Proxy the services through the custom protocol
  protocol.handle(customProtocolScheme, (req) => {

    const pathname = req.url.slice(`${customProtocolScheme}://`.length)

    for (let service in config.services) {
      if (pathname.slice(0, service.length) === service) {
        const newPathname = pathname.slice(service.length)
        const o = config.services[service]
        return net.fetch((new URL(newPathname, o.url)).href)
      }
    }

    return new Response(`${pathname} is not a valid request`, {
      status: 404
    })
})

  await createAppWindows(config) // Start the application from scratch

  app.on('activate', async function () {
    if (BrowserWindow.getAllWindows().length === 0) await createAppWindows(config)
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => services.stop());

// Transfer all the main console commands to the browser
const ogConsoleMethods: any = {};
['log', 'warn', 'error'].forEach(method => {
  const ogMethod = ogConsoleMethods[method] = console[method]
  console[method] = (...args) => {
    onWindowReady(win => send.call(win, `console.${method}`, ...args))
    ogMethod(...args)
  }
})
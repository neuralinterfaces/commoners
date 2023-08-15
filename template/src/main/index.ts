
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import * as services from './services/index'

import plugins from '../../../packages/plugins/index'

import { existsSync } from 'node:fs'

// import chalk from 'chalk'

const isProduction = !process.env.VITE_DEV_SERVER_URL
const commonersDist = (process.platform === 'win32' || !isProduction) ? join(__dirname, '..') : join(app.getAppPath(), 'dist', '.commoners') // NOTE: __dirname will be resolved since this is going to be transpiled into CommonJS
const commonersAssets = join(commonersDist, 'assets')
const dist = join(commonersDist, '..') 
const devServerURL = process.env.VITE_DEV_SERVER_URL

  // Get the COMMONERS configuration file
  const configFileName = 'commoners.config.js'
  const configPath = join(commonersAssets, configFileName)
  const config = existsSync(configPath) ? require(configPath).default : {}

  const defaultIcon = config.icon && (typeof config.icon === 'string' ? config.icon : Object.values(config.icon).find(str => typeof str === 'string'))
  const linuxIcon = config.icon?.linux || defaultIcon

const platformDependentWindowConfig = (process.platform === 'linux' && linuxIcon) ? { icon: linuxIcon } : {}


const globals = {
  firstOpen: true
}

function createAppWindows(config) {

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

    globals['splash'] = splash // Replace splash entry with the active window
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

  // Activate specified plugins from the configuration file
  if ('plugins' in config){
    for (let name in config.plugins) {
      const plugin = plugins.find(o => o.name === name)
      if (plugin) plugin.main.call(ipcMain, mainWindow)
    }
  }

  mainWindow.on('ready-to-show', () => {

    if (globals['splash']) {
      setTimeout(() => {
        globals['splash'].close();
        delete globals['splash']
        mainWindow.show();
        globals.firstOpen = false
      }, globals.firstOpen ? 1000 : 200);
     } 
     
     else mainWindow.show()

  })

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


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {

  // Pass preconfigured properties to the main service declaration
  if ('COMMONERS_SERVICES' in process.env) {
    const preconfigured = JSON.parse(process.env.COMMONERS_SERVICES)
    for (let id in preconfigured) {
      if (typeof config.services[id] === 'string') config.services[id] = { src: config.services[id] }
      config.services[id] = Object.assign(config.services[id], preconfigured[id])
    }
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId(`com.${app.name}`)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await services.createAll(config.services, commonersAssets) // Create all services as configured by the user / main build

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

app.on('will-quit', () => services.stop());

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// @ts-ignore
import icon from '../../resources/icon.png?asset'

import * as services from './services/index'

import plugins from '../../../plugins/index'
import { existsSync } from 'fs'

// import chalk from 'chalk'

const commonersDist = join(__dirname, '..')
const commonersAssets = join(commonersDist, 'assets')
const dist = join(commonersDist, '..') // NOTE: __dirname will be resolved since this is going to be transpiled into CommonJS
const devServerURL = process.env.VITE_DEV_SERVER_URL

  // Get the COMMONERS configuration file
  const configFileName = 'commoners.config.js'
  const configPath = join(commonersAssets, configFileName)
  const config = existsSync(configPath) ? require(configPath).default : {}

const platformDependentWindowConfig = (process.platform === 'linux' ? { icon } : {})

function createWindow(config): void {

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

    if (config.electron?.splash) {
      setTimeout(() => {
        config.electron.splash.close();
        mainWindow.show();
      }, 1000);
     } 
     
     else mainWindow.show()

  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => services.stop());

  // HMR for renderer base on commoners cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && devServerURL) mainWindow.loadURL(devServerURL) 
  else mainWindow.loadFile(join(dist, 'index.html'))
}

const startMainApp = async (config) => {
  await services.createAll(config.services, commonersAssets) // Create all services as configured by the user / main build
  createWindow(config)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {


  // Pass preconfigured properties to the main service declaration
  if ('COMMONERS_SERVICES' in process.env) {
    const preconfigured = JSON.parse(process.env.COMMONERS_SERVICES)
    for (let id in preconfigured) {
      if (typeof config.services[id] === 'string') config.services[id] = { file: config.services[id] }
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

    splash.loadFile(join(commonersAssets, splashURL))

    config.electron.splash = splash // Replace splash entry with the active window
  }


  await startMainApp(config)

  app.on('activate', async function () {
    if (BrowserWindow.getAllWindows().length === 0) await startMainApp(config)
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

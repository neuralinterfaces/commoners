import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// @ts-ignore
import icon from '../../resources/icon.png?asset'

import { fork } from 'node:child_process'
import { ChildProcess } from 'child_process'

import plugins from '../../../plugins/index'

// import chalk from 'chalk'

const commonersDist = join(__dirname, '..')
const dist = join(commonersDist, '..') // NOTE: __dirname will be resolved since this is going to be transpiled into CommonJS
const devServerURL = process.env.VITE_DEV_SERVER_URL

let processes: {[x:string]: ChildProcess} = {}
// Create and monitor arbitary Node.js processes
const spawnBackendInstance = (filepath, id) => {

  if (filepath.endsWith('.ts')) filepath = filepath.slice(0, -2) + 'js' // Load transpiled file

  const fullpath = resolve(commonersDist, 'assets', filepath) // Find file in assets
  const process = fork(fullpath, { silent: true })
  const label = id ? `commoners-${id}-service` : 'commoners-service'
  if (process.stdout) process.stdout.on('data', (data) => console.log(`[${label}]: ${data}`));
  if (process.stderr) process.stderr.on('data', (data) => console.error(`[${label}]: ${data}`));
  process.on('close', (code) => code === null ? console.log(`Restarting ${label}...`) : console.error(`[${label}]: exited with code ${code}`)); 
  // process.on('close', (code) => code === null ? console.log(chalk.gray(`Restarting ${label}...`)) : console.error(chalk.red(`[${label}]: exited with code ${code}`))); 
  processes[id] = process
}

function createWindow(config): void {

  const preload = join(commonersDist, 'preload', 'index.js')

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: preload,
      sandbox: false
    }
  })

  // Activate specified plugins from the configuration file
  if ('plugins' in config){
    for (let name in config.plugins) {
      const plugin = plugins.find(o => o.name === name)
      if (plugin) plugin.main.call(ipcMain, mainWindow)
    }
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', _ => {
    for (let id in processes) processes[id].kill()
    processes = {}
  });

  // HMR for renderer base on commoners cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && devServerURL) mainWindow.loadURL(devServerURL) 
  else mainWindow.loadFile(join(dist, 'index.html'))
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {

  // Get the COMMONERS configuration file
  const configFileName = 'commoners.config.js'
  const configPath = join(commonersDist, 'assets', configFileName)
  const config = require(configPath).default
  Object.entries(config.services).forEach(([id, path]) => spawnBackendInstance(path, id)) // Run sidecars automatically based on the configuration file


  // Set app user model id for windows
  electronApp.setAppUserModelId(`com.${app.name}`)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow(config)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

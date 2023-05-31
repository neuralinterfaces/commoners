import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { spawn } from 'node:child_process'
import { existsSync } from 'fs'
const filepath = join(__dirname, '../../..', 'app', 'services', 'backend', 'index.js')

const distElectron = join(__dirname, '..')
const dist = join(distElectron, '../dist')
const devServerURL = process.env.VITE_DEV_SERVER_URL


// Create and monitor arbitary Node.js processes
const spawnBackendInstance = (filepath) => {
  const ls = spawn('node', [ filepath ]);
  ls.stdout.on('data', (data) => console.log(`[commoners-service]: ${data}`));
  ls.stderr.on('data', (data) => console.error(`[commoners-service]: ${data}`));
  ls.on('close', (code) => console.log(`[commoners-service]: exited with code ${code}`)); 
}

function createWindow(): void {

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && devServerURL) mainWindow.loadURL(devServerURL) 
  else  mainWindow.loadFile(join(__dirname, join(dist, 'index.html')))
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {

  // Get the COMMONERS configuration file
  const configFileName = 'commoners.config.js'
  const configPath = join(process.cwd(), configFileName)

  if (existsSync(configPath)) {
    const config = (await import(configPath)).default

    // Run sidecars automatically based on the configuration file
    config.services.forEach(relativePath => spawnBackendInstance(relativePath))
  }

  else console.error(`${configFileName} does not exist for this project.`)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

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

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

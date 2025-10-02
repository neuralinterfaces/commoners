/**
 * Lifecycle Module
 *
 * Handles Electron app lifecycle events and management.
 * This module is responsible for:
 * - App startup and ready handling
 * - Activate handler (macOS)
 * - Window close handlers
 * - Quit/shutdown logic
 * - Uncaught exception handling
 * - Signal handling (SIGTERM, SIGINT)
 */

import electron, { app, Event } from 'electron'

/**
 * Lifecycle handlers configuration
 */
export interface LifecycleHandlers {
  onReady?: () => Promise<void> | void
  onActivate?: () => void
  onWindowAllClosed?: () => void
  onBeforeQuit?: (event: Event) => Promise<void> | void
  onWillQuit?: (event: Event) => void
}

/**
 * Global quit state
 */
interface QuitState {
  message: string | null
}

const quitState: QuitState = {
  message: null,
}

/**
 * Setup the global COMMONERS_QUIT function
 * Allows plugins and other code to trigger graceful shutdown
 */
export function setupQuitHandler(): void {
  globalThis.COMMONERS_QUIT = (message?: string) => {
    quitState.message = message || null
    app.quit()
  }
}

/**
 * Get the quit message
 */
export function getQuitMessage(): string | null {
  return quitState.message
}

/**
 * Setup lifecycle event handlers
 */
export function setupLifecycleHandlers(handlers: LifecycleHandlers): void {
  const { onReady, onActivate, onWindowAllClosed, onBeforeQuit, onWillQuit } = handlers

  // App ready handler
  if (onReady) {
    app.whenReady().then(async () => {
      await onReady()
    })
  }

  // Activate handler (macOS)
  if (onActivate) {
    app.on('activate', onActivate)
  }

  // Window all closed handler
  if (onWindowAllClosed) {
    app.on('window-all-closed', onWindowAllClosed)
  }

  // Before quit handler
  if (onBeforeQuit) {
    app.on('before-quit', async (ev) => {
      ev.preventDefault()
      await onBeforeQuit(ev)
      app.exit()
    })
  }

  // Will quit handler
  if (onWillQuit) {
    app.on('will-quit', onWillQuit)
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupSignalHandlers(setShuttingDown: (value: boolean) => void): void {
  app.on('ready', async () => {
    const signals = ['SIGTERM', 'SIGINT']
    signals.forEach(signal => {
      process.on(signal, () => {
        setShuttingDown(true)
        const message = `Received ${signal}. Shutting down gracefully...`
        if (globalThis.COMMONERS_QUIT) {
          globalThis.COMMONERS_QUIT(message)
        } else {
          app.quit()
        }
      })
    })
  })
}

/**
 * Setup uncaught exception handler
 */
export function handleUncaughtExceptions(): void {
  process.on('uncaughtException', err => {
    if (err.code === 'EPIPE') return // Ignore EPIPE errors

    electron.dialog.showErrorBox('Uncaught Commoners Error', `${err.message}\n\n${err.stack}`)
  })
}

/**
 * Get current platform
 */
export function getPlatform(): 'windows' | 'mac' | 'linux' {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
}

/**
 * Setup default window-all-closed behavior
 * Quits on all platforms except macOS
 */
export function setupDefaultWindowAllClosedHandler(): void {
  const platform = getPlatform()
  app.on(
    'window-all-closed',
    () => platform !== 'mac' && globalThis.COMMONERS_QUIT?.('All windows have been closed.')
  )
}

/**
 * Setup STDIN command interface
 * Allows external commands to control the app (e.g., reload)
 */
export function setupStdinCommands(): void {
  const { createInterface } = require('node:readline')
  const { BrowserWindow } = require('electron')

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })

  rl.on('line', (line: string) => {
    try {
      const msg = JSON.parse(line.trim())
      const { command, data } = msg

      if (command === 'reload') {
        const { frontend, service } = data || {}
        if (frontend) {
          BrowserWindow.getAllWindows().forEach(
            (win: any) => !win.isDestroyed() && win.webContents.reload()
          )
        }
        if (service) {
          console.warn('Service reloads are not yet implemented in the Electron main process.')
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  })
}

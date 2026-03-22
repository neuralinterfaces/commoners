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

import { app } from 'electron'

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
export function setupQuitHandler(quit?: () => void): void {
  const doQuit = quit ?? (() => app.quit())
  globalThis.COMMONERS_QUIT = (message?: string) => {
    quitState.message = message || null
    doQuit()
  }
}

/**
 * Get the quit message
 */
export function getQuitMessage(): string | null {
  return quitState.message
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupSignalHandlers(
  setShuttingDown: (value: boolean) => void,
  opts?: {
    quit: () => void
    onReady: (cb: () => void) => void
  }
): void {
  const quit = opts?.quit ?? (() => app.quit())
  const onReady = opts?.onReady ?? ((cb: () => void) => app.on('ready', cb))

  onReady(() => {
    const signals = ['SIGTERM', 'SIGINT']
    signals.forEach(signal => {
      process.on(signal, () => {
        setShuttingDown(true)
        const message = `Received ${signal}. Shutting down gracefully...`
        if (globalThis.COMMONERS_QUIT) {
          globalThis.COMMONERS_QUIT(message)
        } else {
          quit()
        }
      })
    })
  })
}

/**
 * Setup uncaught exception handler
 */
export function handleUncaughtExceptions(
  showErrorBox: (title: string, content: string) => void
): void {
  process.on('uncaughtException', err => {
    if (err.code === 'EPIPE') return // Ignore EPIPE errors

    showErrorBox('Uncaught Commoners Error', `${err.message}\n\n${err.stack}`)
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
export function setupDefaultWindowAllClosedHandler(
  onWindowAllClosed?: (cb: () => void) => void
): void {
  const platform = getPlatform()
  const register = onWindowAllClosed ?? ((cb: () => void) => app.on('window-all-closed', cb))
  register(() => platform !== 'mac' && globalThis.COMMONERS_QUIT?.('All windows have been closed.'))
}

/**
 * Setup STDIN command interface
 * Allows external commands to control the app (e.g., reload)
 */
export function setupStdinCommands(
  getAllWindows: () => any[],
  callbacks?: {
    onServiceReload?: (serviceId: string) => void
  }
): void {
  const { createInterface } = require('node:readline')

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
          getAllWindows().forEach((win: any) => !win.isDestroyed() && win.webContents.reload())
        }
        if (service) {
          if (callbacks?.onServiceReload) {
            callbacks.onServiceReload(service)
          }
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  })
}

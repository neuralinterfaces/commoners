/**
 * Window Management Module
 *
 * Handles creation and management of Electron browser windows.
 * This module is responsible for:
 * - Window creation with proper configuration
 * - Window state management (main window, references)
 * - Single instance enforcement
 * - Window restoration and focus
 * - Window lifecycle management
 */

import { app, BrowserWindow } from 'electron'
import { ElectronWindowOptions, ExtendedElectronBrowserWindow } from '../../../types'

/**
 * Global window context
 */
export interface WindowContext {
  mainWindow: BrowserWindow | null
  isShuttingDown: boolean
  firstInitialized: boolean
  windowCount: number
  windowRefs: {
    location: Record<string, { search?: string; hash?: string }>
    window: Record<string, BrowserWindow>
  }
  readyQueue: ((win: BrowserWindow) => any)[]
}

// Create the global context
const context: WindowContext = {
  mainWindow: null,
  isShuttingDown: false,
  firstInitialized: false,
  windowCount: 0,
  windowRefs: {
    location: {},
    window: {},
  },
  readyQueue: [],
}

/**
 * Get the window context
 */
export function getWindowContext(): WindowContext {
  return context
}

/**
 * Restore or focus the main window
 */
export function restoreWindow(): BrowserWindow | null {
  const { mainWindow } = context
  if (mainWindow) {
    mainWindow.isMinimized() ? mainWindow.restore() : mainWindow.focus()
  }
  return mainWindow
}

/**
 * Enforce single instance of the application
 */
export function makeSingleInstance(
  onSecondInstance?: () => void,
  opts?: {
    requestLock: () => boolean
    exit: () => void
    onSecond: (cb: () => void) => void
  }
): void {
  if (process.mas) return

  const requestLock = opts?.requestLock ?? (() => app.requestSingleInstanceLock())
  const exit = opts?.exit ?? (() => app.exit())
  const onSecond = opts?.onSecond ?? ((cb: () => void) => app.on('second-instance', cb))

  if (!requestLock()) {
    console.error('Another instance of this application is already running.')
    exit() // Skip quit callbacks
  } else {
    onSecond(() => {
      if (onSecondInstance) onSecondInstance()
      else restoreWindow()
    })
  }
}

/**
 * Set the main window
 */
export function setMainWindow(win: BrowserWindow | null): void {
  context.mainWindow = win
}

/**
 * Mark first window as initialized
 */
export function setFirstInitialized(): void {
  context.firstInitialized = true
}

/**
 * Flush the ready queue
 */
export function flushReadyQueue(win: BrowserWindow): void {
  context.readyQueue.forEach(f => f(win))
  context.readyQueue = []
}

/**
 * Get next window ID
 */
export function getNextWindowId(): number {
  return context.windowCount++
}

/**
 * Register window reference
 */
export function registerWindow(id: number, win: BrowserWindow): void {
  context.windowRefs.window[id] = win
  context.windowRefs.location[id] = {
    search: undefined,
    hash: undefined,
  }
}

/**
 * Unregister window reference
 */
export function unregisterWindow(id: number): void {
  delete context.windowRefs.window[id]
  delete context.windowRefs.location[id]
}

/**
 * Get window by ID
 */
export function getWindowById(id: number): BrowserWindow | undefined {
  return context.windowRefs.window[id]
}

/**
 * Get window location by ID
 */
export function getWindowLocation(id: number): { search?: string; hash?: string } | undefined {
  return context.windowRefs.location[id]
}

/**
 * Update window location
 */
export function updateWindowLocation(
  id: number,
  location: { search?: string; hash?: string }
): void {
  if (context.windowRefs.location[id]) {
    Object.assign(context.windowRefs.location[id], location)
  }
}

/**
 * Set shutdown state
 */
export function setShuttingDown(value: boolean): void {
  context.isShuttingDown = value
}

/**
 * Check if shutting down
 */
export function isShuttingDown(): boolean {
  return context.isShuttingDown
}

/**
 * Setup default window management behaviors
 * Overrides close and show methods to respect shutdown state
 */
export function setupWindowBehaviors(win: ExtendedElectronBrowserWindow): void {
  const originalManagers = {
    close: win.close,
    show: win.show,
  }

  Object.entries(originalManagers).forEach(([key, value]) => {
    win[key] = function (...args) {
      if (key === 'show' && !win.__show) return // Skip show behavior for testing
      if (context.isShuttingDown) return // Skip if process is shutting down
      return value.call(this, ...args)
    }
  })
}

/**
 * Create a main window
 * Ensures only one main window exists
 */
export async function createMainWindow(
  createWindowFn: (page?: string, options?: ElectronWindowOptions, toIgnore?: string[], isMain?: boolean) => Promise<BrowserWindow>,
  windowOptions: ElectronWindowOptions,
  getAllWindows?: () => BrowserWindow[]
): Promise<BrowserWindow | undefined> {
  const windows = getAllWindows ? getAllWindows() : BrowserWindow.getAllWindows()
  const existingMain = windows.find(o => (o as ExtendedElectronBrowserWindow).__main)

  if (existingMain) return undefined // Force only one main window

  return await createWindowFn(undefined, windowOptions, [], true)
}

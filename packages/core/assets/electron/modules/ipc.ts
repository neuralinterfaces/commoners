/**
 * IPC (Inter-Process Communication) Module
 *
 * Provides helpers for scoped IPC messaging between main and renderer processes.
 * This module is responsible for:
 * - Safe window message sending
 * - Scoped IPC channels (services, plugins)
 * - IPC listener management
 * - Console redirection to renderer
 */

import { BrowserWindow, ipcMain } from 'electron'

/**
 * Listener handle with remove method
 */
export interface ListenerHandle {
  remove: () => void
}

/**
 * Safely send a message to a window
 * Handles destroyed windows gracefully
 */
export function send(win: BrowserWindow, channel: string, ...args: any[]): void {
  try {
    if (win.isDestroyed()) return // Do not send messages to destroyed windows
    win.webContents.send(channel, ...args)
  } catch (e) {
    // Window may have been closed - this is expected and safe to ignore
    console.debug(`Failed to send message to channel ${channel}:`, e instanceof Error ? e.message : e)
  }
}

/**
 * Get a scoped identifier for IPC channels
 */
function getScopedIdentifier(type: string, source: string, attr: string): string {
  return `${type}:${source}:${attr}`
}

/**
 * Register a scoped IPC listener
 */
export function scopedOn(
  type: string,
  id: string,
  channel: string,
  callback: (...args: any[]) => void
): ListenerHandle {
  const event = getScopedIdentifier(type, id, channel)
  ipcMain.on(event, callback)
  const remove = () => ipcMain.removeListener(event, callback)
  return { remove }
}

/**
 * Register a scoped IPC handler.
 * Replaces any existing handler for the same channel since ipcMain.handle
 * only allows one handler per channel. This is needed because desktop.load
 * runs for each window (e.g., splash + main).
 */
export function scopedHandle(
  type: string,
  id: string,
  channel: string,
  callback: (...args: any[]) => any
): ListenerHandle {
  const event = getScopedIdentifier(type, id, channel)
  try { ipcMain.removeHandler(event) } catch {}
  ipcMain.handle(event, callback)
  const remove = () => { try { ipcMain.removeHandler(event) } catch {} }
  return { remove }
}

/**
 * Send a scoped message to all windows
 */
export function scopedSend(type: string, id: string, channel: string, ...args: any[]): void {
  const windows = BrowserWindow.getAllWindows()
  const event = getScopedIdentifier(type, id, channel)
  windows.forEach(win => send(win, event, ...args))
}

/**
 * Send a message to a service channel
 */
export function serviceSend(id: string, channel: string, ...args: any[]): void {
  scopedSend('services', id, channel, ...args)
}

/**
 * Register a listener for service messages
 */
export function serviceOn(
  id: string,
  channel: string,
  callback: (...args: any[]) => void
): ListenerHandle {
  return scopedOn('services', id, channel, callback)
}

/**
 * Register a handler for service messages (async invoke pattern)
 */
export function serviceHandle(
  id: string,
  channel: string,
  callback: (...args: any[]) => any
): ListenerHandle {
  return scopedHandle('services', id, channel, callback)
}

/**
 * Send a message to a plugin channel
 */
export function pluginSend(pluginName: string, channel: string, ...args: any[]): void {
  scopedSend('plugins', pluginName, channel, ...args)
}

/**
 * Register a listener for plugin messages
 */
export function pluginOn(
  pluginName: string,
  channel: string,
  callback: (...args: any[]) => void
): ListenerHandle {
  return scopedOn('plugins', pluginName, channel, callback)
}

/**
 * Register a handler for plugin messages
 */
export function pluginHandle(
  pluginName: string,
  channel: string,
  callback: (...args: any[]) => any
): ListenerHandle {
  return scopedHandle('plugins', pluginName, channel, callback)
}

/**
 * Setup console redirection to renderer windows
 * Redirects console.log, console.warn, console.error to all windows
 */
export function setupConsoleRedirection(): void {
  const ogConsoleMethods: any = {}
  ;['log', 'warn', 'error'].forEach(method => {
    const ogMethod = (ogConsoleMethods[method] = console[method])
    console[method] = (...args) => {
      // Send to all windows
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(win => send(win, `commoners:console.${method}`, ...args))
      ogMethod(...args)
    }
  })
}

/**
 * Callback manager for window ready states
 */
export class CallbackManager {
  private callbacks: Record<string, (() => void)[]> = {}

  /**
   * Add a callback for a specific event
   */
  add(levels: string, callback: () => void): void {
    const levelArray = levels.split(':')
    const lastId = levelArray.pop()!

    let ref: any = this.callbacks
    for (const level of levelArray) {
      if (!ref[level]) ref[level] = {}
      ref = ref[level]
    }

    if (!ref[lastId]) ref[lastId] = []
    ref[lastId].push(callback)
  }

  /**
   * Run all callbacks for a specific event and clear them
   */
  run(levels: string): void {
    const levelArray = levels.split(':')
    const lastLevel = levelArray.pop()!

    let ref: any = this.callbacks
    for (const level of levelArray) {
      if (!ref[level]) return
      ref = ref[level]
    }

    const resolvedCallbacks = ref[lastLevel]
    if (!resolvedCallbacks) return

    resolvedCallbacks.forEach((callback: () => void) => callback())
    delete ref[lastLevel]
  }
}

/**
 * Helper for queuing functions until next window is ready
 */
export function onNextWindowReady(f: (win: BrowserWindow) => any): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    // Queue for later
    return
  }
  windows.forEach(win => f(win))
}

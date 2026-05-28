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

import { validateIPCMessage } from './ipc-channels'
import { validateChannel } from './ipc-allowlist'
import type { IPCAllowlist } from './ipc-allowlist'

/**
 * Module-level hooks reference for emitting security events.
 * Set via setHooks() after hooks are resolved in main.ts.
 */
let _hooks: any = null

/**
 * Set the hooks interface for IPC validation event emission.
 */
export function setHooks(hooks: any): void {
  _hooks = hooks
}

/**
 * Module-level IPC allowlist for capabilities-driven channel validation.
 * When set, scoped channels are validated against declared plugin/service IDs.
 */
let _allowlist: IPCAllowlist | null = null

/**
 * Set the IPC allowlist for capabilities-driven validation.
 */
export function setIPCAllowlist(allowlist: IPCAllowlist): void {
  _allowlist = allowlist
}

/**
 * Module-level IPC backend and window accessor.
 * Defaults to Electron's ipcMain and BrowserWindow.getAllWindows() but can be
 * overridden via setIPCBackend() for runtime abstraction.
 */
let _ipcMain: any = null
let _getAllWindows: () => any[] = () => []

function getIpcMain(): any {
  if (!_ipcMain) {
    const { ipcMain } = require('electron')
    _ipcMain = ipcMain
  }
  return _ipcMain
}

function getAllWindows(): any[] {
  return _getAllWindows()
}

/**
 * Configure the IPC backend. Call once from main.ts after runtime is created.
 */
export function setIPCBackend(ipcMain: any, getAllWindows: () => any[]): void {
  _ipcMain = ipcMain
  _getAllWindows = getAllWindows
}

/**
 * Module-level configurable sendToRenderer function.
 * When set, the send() function delegates to this instead of direct Electron calls.
 */
let _sendToRenderer: ((win: any, channel: string, ...args: any[]) => void) | null = null

/**
 * Configure the renderer send function. Call once from main.ts after runtime is created.
 */
export function setSendToRenderer(fn: (win: any, channel: string, ...args: any[]) => void): void {
  _sendToRenderer = fn
}

/**
 * Log and optionally emit a validation failure.
 */
function logValidationFailure(channel: string, failure: string): void {
  console.warn(`[IPC validation] ${failure}`)
  _hooks?.emit?.({ type: 'security:ipc:validation-fail', channel, message: failure })
}

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
export function send(win: any, channel: string, ...args: any[]): void {
  try {
    if (_sendToRenderer) return _sendToRenderer(win, channel, ...args)
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
 * Validate a scoped channel against the IPC allowlist (if configured).
 * Returns true if allowed, false if blocked.
 */
function checkAllowlist(event: string): boolean {
  if (!_allowlist) return true
  const failure = validateChannel(event, _allowlist)
  if (failure) {
    logValidationFailure(event, failure)
    return false
  }
  return true
}

/**
 * Register a scoped IPC listener with argument validation
 */
export function scopedOn(
  type: string,
  id: string,
  channel: string,
  callback: (...args: any[]) => void
): ListenerHandle {
  const event = getScopedIdentifier(type, id, channel)
  if (!checkAllowlist(event)) return { remove: () => {} }
  const wrappedCallback = (...args: any[]) => {
    // args[0] is IpcMainEvent — validate the rest
    const failure = validateIPCMessage(event, args.slice(1))
    if (failure) logValidationFailure(event, failure)
    callback(...args)
  }
  getIpcMain().on(event, wrappedCallback)
  const remove = () => getIpcMain().removeListener(event, wrappedCallback)
  return { remove }
}

/**
 * Register a scoped IPC handler with argument validation.
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
  if (!checkAllowlist(event)) return { remove: () => {} }
  try { getIpcMain().removeHandler(event) } catch {}
  const wrappedCallback = (...args: any[]) => {
    // args[0] is IpcMainInvokeEvent — validate the rest
    const failure = validateIPCMessage(event, args.slice(1))
    if (failure) logValidationFailure(event, failure)
    return callback(...args)
  }
  getIpcMain().handle(event, wrappedCallback)
  const remove = () => { try { getIpcMain().removeHandler(event) } catch {} }
  return { remove }
}

/**
 * Send a scoped message to all windows
 */
export function scopedSend(type: string, id: string, channel: string, ...args: any[]): void {
  const windows = getAllWindows()
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
      const windows = getAllWindows()
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

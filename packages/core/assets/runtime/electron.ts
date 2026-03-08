/**
 * Electron Runtime Adapter
 *
 * Implements the DesktopRuntime interface using Electron APIs.
 * Wraps the 6 existing Electron modules (config, security, ipc, window, protocol, lifecycle)
 * into a unified runtime interface.
 */

import type {
  DesktopRuntime,
  RuntimeIPC,
  RuntimeProtocol,
  RuntimeWindow,
  RuntimeLifecycle,
  ProtocolSchemeConfig,
  ProtocolRequest,
  ProtocolResponse,
} from './types.js'

import * as IPC from '../electron/modules/ipc.js'
import * as Window from '../electron/modules/window.js'
import * as Protocol from '../electron/modules/protocol.js'
import * as Lifecycle from '../electron/modules/lifecycle.js'

class ElectronIPC implements RuntimeIPC {
  send(channel: string, ...args: any[]): void {
    const { ipcMain, BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows().forEach(win => IPC.send(win, channel, ...args))
  }

  on(channel: string, listener: (...args: any[]) => void): void {
    const { ipcMain } = require('electron')
    ipcMain.on(channel, listener)
  }

  once(channel: string, listener: (...args: any[]) => void): void {
    const { ipcMain } = require('electron')
    ipcMain.once(channel, listener)
  }

  invoke(channel: string, ...args: any[]): Promise<any> {
    // In the main process, invoke registers a handler
    // This is exposed for symmetry; actual handler registration uses ipcMain.handle
    const { ipcMain } = require('electron')
    return new Promise((resolve, reject) => {
      ipcMain.once(channel, (_event, ...responseArgs) => resolve(responseArgs[0]))
    })
  }

  removeListener(channel: string, listener: (...args: any[]) => void): void {
    const { ipcMain } = require('electron')
    ipcMain.removeListener(channel, listener)
  }

  removeAllListeners(channel: string): void {
    const { ipcMain } = require('electron')
    ipcMain.removeAllListeners(channel)
  }
}

class ElectronProtocol implements RuntimeProtocol {
  registerScheme(config: ProtocolSchemeConfig): void {
    Protocol.registerProtocolScheme({
      scheme: config.scheme,
      privileges: config.privileges,
    })
  }

  handleRequest(
    scheme: string,
    handler: (req: ProtocolRequest) => Promise<ProtocolResponse | Response>
  ): void {
    const { protocol } = require('electron')
    protocol.handle(scheme, async (electronReq: any) => {
      const req: ProtocolRequest = {
        url: electronReq.url,
        method: electronReq.method,
        headers: Object.fromEntries(electronReq.headers?.entries?.() ?? []),
      }
      return handler(req)
    })
  }
}

class ElectronWindow implements RuntimeWindow {
  async create(page?: string, options?: Record<string, any>): Promise<any> {
    // Delegate to the registered createWindow function
    // The actual window creation is orchestrated by main.ts
    throw new Error('Use createWindow from main.ts orchestrator instead')
  }

  getById(id: string | number): any | null {
    return Window.getWindowById(id as number) ?? null
  }

  restore(): any | null {
    return Window.restoreWindow()
  }

  close(id: string | number): void {
    const win = Window.getWindowById(id as number)
    if (win && !win.isDestroyed()) win.close()
    Window.unregisterWindow(id as number)
  }
}

class ElectronLifecycle implements RuntimeLifecycle {
  onReady(callback: () => void | Promise<void>): void {
    const { app } = require('electron')
    app.whenReady().then(callback)
  }

  onBeforeQuit(callback: () => void | Promise<void>): void {
    const { app } = require('electron')
    app.on('before-quit', async (ev) => {
      ev.preventDefault()
      await callback()
      app.exit()
    })
  }

  quit(): void {
    const { app } = require('electron')
    app.quit()
  }

  getPlatform(): 'windows' | 'mac' | 'linux' {
    return Lifecycle.getPlatform()
  }
}

export function createElectronRuntime(): DesktopRuntime {
  return {
    name: 'electron',
    ipc: new ElectronIPC(),
    protocol: new ElectronProtocol(),
    window: new ElectronWindow(),
    lifecycle: new ElectronLifecycle(),
  }
}

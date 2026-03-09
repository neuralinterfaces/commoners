/**
 * Electron Runtime Adapter
 *
 * Implements the DesktopRuntime interface using Electron APIs.
 * Wraps the existing Electron modules into a unified runtime interface.
 */

import type {
  DesktopRuntime,
  RuntimeIPC,
  RuntimeScopedIPC,
  RuntimeProtocol,
  RuntimeWindow,
  RuntimeLifecycle,
  ListenerHandle,
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
    const { BrowserWindow } = require('electron')
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

class ElectronScopedIPC implements RuntimeScopedIPC {
  scopedOn(type: string, id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle {
    return IPC.scopedOn(type, id, channel, callback)
  }

  scopedHandle(type: string, id: string, channel: string, callback: (...args: any[]) => any): ListenerHandle {
    return IPC.scopedHandle(type, id, channel, callback)
  }

  scopedSend(type: string, id: string, channel: string, ...args: any[]): void {
    IPC.scopedSend(type, id, channel, ...args)
  }

  serviceSend(id: string, channel: string, ...args: any[]): void {
    IPC.serviceSend(id, channel, ...args)
  }

  serviceOn(id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle {
    return IPC.serviceOn(id, channel, callback)
  }

  pluginSend(id: string, channel: string, ...args: any[]): void {
    IPC.pluginSend(id, channel, ...args)
  }

  pluginOn(id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle {
    return IPC.pluginOn(id, channel, callback)
  }

  pluginHandle(id: string, channel: string, callback: (...args: any[]) => any): ListenerHandle {
    return IPC.pluginHandle(id, channel, callback)
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
  const electronModule = require('electron')
  return {
    name: 'electron',
    ipc: new ElectronIPC(),
    scopedIPC: new ElectronScopedIPC(),
    protocol: new ElectronProtocol(),
    window: new ElectronWindow(),
    lifecycle: new ElectronLifecycle(),
    native: electronModule,
  }
}

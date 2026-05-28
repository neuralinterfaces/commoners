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
  RuntimeShell,
  RuntimeApp,
  RuntimeSession,
  RuntimeDialog,
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
  scopedOn(
    type: string,
    id: string,
    channel: string,
    callback: (...args: any[]) => void
  ): ListenerHandle {
    return IPC.scopedOn(type, id, channel, callback)
  }

  scopedHandle(
    type: string,
    id: string,
    channel: string,
    callback: (...args: any[]) => any
  ): ListenerHandle {
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
        headers: Object.fromEntries(
          [...(electronReq.headers?.entries?.() ?? [])].map(([k, v]) => [k.toLowerCase(), v])
        ),
      }
      return handler(req)
    })
  }

  async fetch(url: string): Promise<Response> {
    const { net } = require('electron')
    return net.fetch(url)
  }
}

class ElectronWindow implements RuntimeWindow {
  async create(_page?: string, options?: Record<string, any>): Promise<any> {
    const { BrowserWindow } = require('electron')
    return new BrowserWindow({ ...options, show: false })
  }

  getById(id: string | number): any | null {
    return Window.getWindowById(id as number) ?? null
  }

  getAll(): any[] {
    const { BrowserWindow } = require('electron')
    return BrowserWindow.getAllWindows()
  }

  restore(): any | null {
    return Window.restoreWindow()
  }

  close(id: string | number): void {
    const win = Window.getWindowById(id as number)
    if (win && !win.isDestroyed()) win.close()
    Window.unregisterWindow(id as number)
  }

  show(win: any): void {
    win.show()
  }

  isDestroyed(win: any): boolean {
    return win.isDestroyed()
  }

  async loadURL(win: any, url: string): Promise<void> {
    await win.loadURL(url)
  }

  onClose(win: any, callback: () => void): void {
    win.once('close', callback)
  }

  onReadyToShow(win: any, callback: () => void): void {
    win.once('ready-to-show', callback)
  }

  onNavigate(win: any, handler: (event: any, url: string) => void): void {
    win.webContents.on('will-navigate', handler)
  }

  onWebContentsEvent(win: any, event: string, handler: (...args: any[]) => void): void {
    win.webContents.on(event, handler)
  }

  setWindowOpenHandler(win: any, handler: (details: { url: string }) => { action: string }): void {
    win.webContents.setWindowOpenHandler(handler)
  }

  sendToRenderer(win: any, channel: string, ...args: any[]): void {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

class ElectronShell implements RuntimeShell {
  async openExternal(url: string): Promise<void> {
    const { shell } = require('electron')
    await shell.openExternal(url)
  }
}

class ElectronApp implements RuntimeApp {
  setName(name: string): void {
    const { app } = require('electron')
    app.setName(name)
  }

  getName(): string {
    const { app } = require('electron')
    return app.getName()
  }

  setAppUserModelId(id: string): void {
    const { app } = require('electron')
    app.setAppUserModelId(id)
  }

  commandLine = {
    appendSwitch(key: string, value: string): void {
      const { app } = require('electron')
      app.commandLine.appendSwitch(key, value)
    },
  }
}

class ElectronSession implements RuntimeSession {
  setupCSP(csp: string): void {
    const { session } = require('electron')
    session.defaultSession.webRequest.onHeadersReceived((details: any, callback: any) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      })
    })
  }
}

class ElectronDialog implements RuntimeDialog {
  showErrorBox(title: string, content: string): void {
    const { dialog } = require('electron')
    dialog.showErrorBox(title, content)
  }
}

class ElectronLifecycle implements RuntimeLifecycle {
  onReady(callback: () => void | Promise<void>) {
    const { app } = require('electron')
    return app.whenReady().then(callback)
  }

  onActivate(callback: () => void): void {
    const { app } = require('electron')
    app.on('activate', callback)
  }

  onBeforeQuit(callback: () => void | Promise<void>): void {
    const { app } = require('electron')
    app.on('before-quit', async ev => {
      ev.preventDefault()
      await callback()
      app.exit()
    })
  }

  quit(): void {
    const { app } = require('electron')
    app.quit()
  }

  exit(code?: number): void {
    const { app } = require('electron')
    app.exit(code)
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
    shell: new ElectronShell(),
    app: new ElectronApp(),
    session: new ElectronSession(),
    dialog: new ElectronDialog(),
    native: electronModule,
  }
}

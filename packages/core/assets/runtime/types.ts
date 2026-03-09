/**
 * DesktopRuntime Interface
 *
 * Generic desktop contract that abstracts over Electron, Tauri, or any future
 * desktop runtime. All runtime-specific code should implement these interfaces
 * rather than coupling directly to Electron APIs.
 *
 * Key design decision: `sendSync` (Electron-only) is NOT part of this interface.
 * Use async `invoke` instead.
 */

export interface ListenerHandle {
  remove: () => void
}

export interface RuntimeIPC {
  send(channel: string, ...args: any[]): void
  on(channel: string, listener: (...args: any[]) => void): void
  once(channel: string, listener: (...args: any[]) => void): void
  invoke(channel: string, ...args: any[]): Promise<any>
  removeListener(channel: string, listener: (...args: any[]) => void): void
  removeAllListeners(channel: string): void
}

export interface RuntimeScopedIPC {
  scopedOn(type: string, id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle
  scopedHandle(type: string, id: string, channel: string, callback: (...args: any[]) => any): ListenerHandle
  scopedSend(type: string, id: string, channel: string, ...args: any[]): void

  // Convenience helpers
  serviceSend(id: string, channel: string, ...args: any[]): void
  serviceOn(id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle
  pluginSend(id: string, channel: string, ...args: any[]): void
  pluginOn(id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle
  pluginHandle(id: string, channel: string, callback: (...args: any[]) => any): ListenerHandle
}

export interface ProtocolSchemeConfig {
  scheme: string
  privileges?: {
    standard?: boolean
    secure?: boolean
    supportFetchAPI?: boolean
    corsEnabled?: boolean
    stream?: boolean
  }
}

export interface ProtocolRequest {
  url: string
  method: string
  headers: Record<string, string>
}

export interface ProtocolResponse {
  status: number
  headers?: Record<string, string>
  body?: ReadableStream | ArrayBuffer | string
}

export interface RuntimeProtocol {
  registerScheme(config: ProtocolSchemeConfig): void
  handleRequest(
    scheme: string,
    handler: (req: ProtocolRequest) => Promise<ProtocolResponse | Response>
  ): void
}

export interface RuntimeWindow {
  create(page?: string, options?: Record<string, any>): Promise<any>
  getById(id: string | number): any | null
  restore(): any | null
  close(id: string | number): void
}

export interface RuntimeLifecycle {
  onReady(callback: () => void | Promise<void>): void
  onBeforeQuit(callback: () => void | Promise<void>): void
  quit(): void
  getPlatform(): 'windows' | 'mac' | 'linux'
}

export interface RuntimePluginContext {
  id: string
  MOBILE: boolean
  DESKTOP: boolean
  WEB: boolean
  send(channel: string, ...args: any[]): void
  handle(channel: string, callback: (...args: any[]) => any, win?: any): ListenerHandle
  on(channel: string, callback: (...args: any[]) => void, win?: any): ListenerHandle
  createWindow(page: string, opts?: any): Promise<any>
  open(): Promise<any | null>
  setAttribute(win: any, attr: string, value: any): void
  getAttribute(win: any, attr: string): any
  plugin: { assets: Record<string, string> }
}

export interface DesktopRuntime {
  readonly name: 'electron' | 'tauri'
  readonly ipc: RuntimeIPC
  readonly scopedIPC: RuntimeScopedIPC
  readonly protocol: RuntimeProtocol
  readonly window: RuntimeWindow
  readonly lifecycle: RuntimeLifecycle

  /** Access to the underlying native module (e.g. Electron's `electron` object) */
  readonly native?: any
}

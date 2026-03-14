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
  scopedOn(
    type: string,
    id: string,
    channel: string,
    callback: (...args: any[]) => void
  ): ListenerHandle
  scopedHandle(
    type: string,
    id: string,
    channel: string,
    callback: (...args: any[]) => any
  ): ListenerHandle
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

export interface RuntimeSession {
  setupCSP(csp: string): void
}

export interface RuntimeProtocol {
  registerScheme(config: ProtocolSchemeConfig): void
  handleRequest(
    scheme: string,
    handler: (req: ProtocolRequest) => Promise<ProtocolResponse | Response>
  ): void
  fetch(url: string): Promise<Response>
}

export interface RuntimeWindow {
  create(page?: string, options?: Record<string, any>): Promise<any>
  getById(id: string | number): any | null
  getAll(): any[]
  restore(): any | null
  close(id: string | number): void

  // Window lifecycle
  show(win: any): void
  isDestroyed(win: any): boolean
  loadURL(win: any, url: string): Promise<void>

  // Event handling
  onClose(win: any, callback: () => void): void
  onReadyToShow(win: any, callback: () => void): void
  onNavigate(win: any, handler: (event: any, url: string) => void): void
  onWebContentsEvent(win: any, event: string, handler: (...args: any[]) => void): void
  setWindowOpenHandler(win: any, handler: (details: { url: string }) => { action: string }): void

  // Renderer communication
  sendToRenderer(win: any, channel: string, ...args: any[]): void
}

export interface RuntimeShell {
  openExternal(url: string): Promise<void>
}

export interface RuntimeDialog {
  showErrorBox(title: string, content: string): void
}

export interface RuntimeApp {
  setName(name: string): void
  getName(): string
  setAppUserModelId(id: string): void
  commandLine: { appendSwitch(key: string, value: string): void }
}

export interface RuntimeLifecycle {
  onReady(callback: () => void | Promise<void>): Promise<void>
  onActivate(callback: () => void): void
  onBeforeQuit(callback: () => void | Promise<void>): void
  quit(): void
  exit(code?: number): void
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
  hooks: {
    emit: (event: any) => void
    on: (eventType: string, handler: (event: any) => void) => () => void
  }
  plugin: { assets: Record<string, string> }
}

/**
 * PreloadContract defines the data shape that must be exposed to the renderer
 * before the page loads. Each runtime provides this data through its own mechanism:
 * - Electron: sendSync in preload.ts, exposed via contextBridge
 * - Tauri: injected via Rust or @tauri-apps/api before the page script runs
 *
 * The consumer (onload.ts / commoners global) expects this shape on `globalThis.__commoners`.
 */
export interface PreloadContract {
  quit: (message?: string) => void
  close: () => void
  args: Record<string, any>
  services: Record<
    string,
    {
      url: string
      filepath?: string
      status: () => any
      onClosed: (cb: (code: number) => void) => void
      close: () => void
    }
  >
  on: (channel: string, listener: (...args: any[]) => void) => void
  once: (channel: string, listener: (...args: any[]) => void) => void
  send: (channel: string, ...args: any[]) => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
  removeListener: (channel: string, listener: (...args: any[]) => void) => void
  removeAllListeners: (channel: string) => void
}

export interface DesktopRuntime {
  readonly name: 'electron' | 'tauri'
  readonly ipc: RuntimeIPC
  readonly scopedIPC: RuntimeScopedIPC
  readonly protocol: RuntimeProtocol
  readonly window: RuntimeWindow
  readonly lifecycle: RuntimeLifecycle
  readonly shell: RuntimeShell
  readonly app: RuntimeApp
  readonly session: RuntimeSession
  readonly dialog: RuntimeDialog

  /** Access to the underlying native module (e.g. Electron's `electron` object) */
  readonly native?: any
}

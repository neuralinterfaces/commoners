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

export interface RuntimeIPC {
  send(channel: string, ...args: any[]): void
  on(channel: string, listener: (...args: any[]) => void): void
  once(channel: string, listener: (...args: any[]) => void): void
  invoke(channel: string, ...args: any[]): Promise<any>
  removeListener(channel: string, listener: (...args: any[]) => void): void
  removeAllListeners(channel: string): void
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

export interface DesktopRuntime {
  readonly name: 'electron' | 'tauri'
  readonly ipc: RuntimeIPC
  readonly protocol: RuntimeProtocol
  readonly window: RuntimeWindow
  readonly lifecycle: RuntimeLifecycle
}

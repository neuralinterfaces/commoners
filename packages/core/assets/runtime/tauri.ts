/**
 * Tauri Runtime Adapter
 *
 * Implements the DesktopRuntime interface for Tauri v2.
 *
 * IMPORTANT: Unlike the Electron adapter (which runs in Node.js main process),
 * this adapter runs in the frontend/webview. Tauri's main process is Rust, not
 * JavaScript, so certain RuntimeXxx methods are no-ops by design:
 *
 *   - Protocol: Scheme registration and request handling are Rust-side (tauri.conf.json)
 *   - Session: CSP is immutable after startup (Rust security boundary)
 *   - App: commandLine and appUserModelId are Rust-time / OS-specific config
 *   - Window: onNavigate, onWebContentsEvent, setWindowOpenHandler are Electron-only concepts
 *
 * Dependencies (must be installed by the user):
 *   @tauri-apps/api           — core invoke, event, window APIs
 *   @tauri-apps/plugin-opener — URL opener (optional, falls back to window.open)
 *   @tauri-apps/plugin-dialog — dialog boxes (optional, falls back to alert)
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

const scopedChannel = (type: string, id: string, channel: string) =>
  `commoners:${type}:${id}:${channel}`

class TauriIPC implements RuntimeIPC {
  send(channel: string, ...args: any[]): void {
    import('@tauri-apps/api/event').then(({ emit }) => emit(channel, args))
  }

  on(channel: string, listener: (...args: any[]) => void): void {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen(channel, event => listener(event.payload))
    })
  }

  once(channel: string, listener: (...args: any[]) => void): void {
    import('@tauri-apps/api/event').then(({ once }) => {
      once(channel, event => listener(event.payload))
    })
  }

  async invoke(channel: string, ...args: any[]): Promise<any> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke(channel, { args })
  }

  /** Tauri uses unlisten() from listen/once return values. Use ListenerHandle.remove() instead. */
  removeListener(_channel: string, _listener: (...args: any[]) => void): void {}

  /** Not directly supported in Tauri's event system. Use ListenerHandle.remove() instead. */
  removeAllListeners(_channel: string): void {}
}

class TauriScopedIPC implements RuntimeScopedIPC {
  private unlisteners = new Map<string, () => void>()

  scopedOn(
    type: string,
    id: string,
    channel: string,
    callback: (...args: any[]) => void
  ): ListenerHandle {
    const fullChannel = scopedChannel(type, id, channel)
    const key = `${fullChannel}:${Date.now()}`

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen(fullChannel, event => callback(event.payload)).then(unlisten => {
        this.unlisteners.set(key, unlisten)
      })
    })

    return {
      remove: () => {
        const unlisten = this.unlisteners.get(key)
        if (unlisten) {
          unlisten()
          this.unlisteners.delete(key)
        }
      },
    }
  }

  scopedHandle(
    type: string,
    id: string,
    channel: string,
    callback: (...args: any[]) => any
  ): ListenerHandle {
    return this.scopedOn(type, id, channel, async (...args) => {
      const result = await callback(...args)
      import('@tauri-apps/api/event').then(({ emit }) => {
        emit(`${scopedChannel(type, id, channel)}:response`, result)
      })
    })
  }

  scopedSend(type: string, id: string, channel: string, ...args: any[]): void {
    import('@tauri-apps/api/event').then(({ emit }) => {
      emit(scopedChannel(type, id, channel), args)
    })
  }

  serviceSend(id: string, channel: string, ...args: any[]): void {
    this.scopedSend('services', id, channel, ...args)
  }

  serviceOn(id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle {
    return this.scopedOn('services', id, channel, callback)
  }

  pluginSend(id: string, channel: string, ...args: any[]): void {
    this.scopedSend('plugins', id, channel, ...args)
  }

  pluginOn(id: string, channel: string, callback: (...args: any[]) => void): ListenerHandle {
    return this.scopedOn('plugins', id, channel, callback)
  }

  pluginHandle(id: string, channel: string, callback: (...args: any[]) => any): ListenerHandle {
    return this.scopedHandle('plugins', id, channel, callback)
  }
}

/** N/A: Protocol registration is Rust-side (tauri.conf.json security.csp). */
class TauriProtocol implements RuntimeProtocol {
  registerScheme(_config: ProtocolSchemeConfig): void {}

  handleRequest(
    _scheme: string,
    _handler: (req: ProtocolRequest) => Promise<ProtocolResponse | Response>
  ): void {}

  async fetch(url: string): Promise<Response> {
    return globalThis.fetch(url)
  }
}

class TauriWindow implements RuntimeWindow {
  async create(page?: string, options?: Record<string, any>): Promise<any> {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const label = `window-${Date.now()}`
    return new WebviewWindow(label, { url: page, ...options })
  }

  getById(id: string | number): any | null {
    try {
      // Synchronous import not possible — return null. Use async getByLabel in app code.
      return null
    } catch {
      return null
    }
  }

  async getAll(): Promise<any[]> {
    try {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow')
      return getAllWebviewWindows()
    } catch {
      return []
    }
  }

  restore(): any | null {
    return null
  }

  close(id: string | number): void {
    import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      const win = WebviewWindow.getByLabel(String(id))
      win?.close()
    }).catch(() => {})
  }

  show(win: any): void {
    win?.show?.()
  }

  isDestroyed(_win: any): boolean {
    return false
  }

  async loadURL(win: any, url: string): Promise<void> {
    // Tauri WebviewWindow doesn't have a direct loadURL equivalent from JS.
    // Navigation is typically done via Tauri's internal routing.
    if (win?.navigate) await win.navigate(url)
  }

  onClose(win: any, callback: () => void): void {
    if (win?.onCloseRequested) {
      win.onCloseRequested(() => { callback() })
    }
  }

  onReadyToShow(_win: any, callback: () => void): void {
    callback()
  }

  /** N/A: Tauri navigation is handled internally. */
  onNavigate(_win: any, _handler: (event: any, url: string) => void): void {}

  /** N/A: Tauri doesn't expose webContents events to the frontend. */
  onWebContentsEvent(_win: any, _event: string, _handler: (...args: any[]) => void): void {}

  /** N/A: Window open handling is Tauri-internal. */
  setWindowOpenHandler(_win: any, _handler: (details: { url: string }) => { action: string }): void {}

  sendToRenderer(_win: any, channel: string, ...args: any[]): void {
    import('@tauri-apps/api/event').then(({ emit }) => emit(channel, args))
  }
}

class TauriShell implements RuntimeShell {
  async openExternal(url: string): Promise<void> {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    } catch {
      globalThis.window?.open(url, '_blank')
    }
  }
}

class TauriApp implements RuntimeApp {
  private _name = ''

  setName(name: string): void {
    this._name = name
  }

  getName(): string {
    return this._name
  }

  /** N/A: Windows-specific, not applicable in Tauri frontend. */
  setAppUserModelId(_id: string): void {}

  commandLine = {
    /** N/A: Command-line args are set in Rust (tauri.conf.json). */
    appendSwitch(_key: string, _value: string): void {},
  }
}

/** N/A: CSP is configured in tauri.conf.json and immutable at runtime. */
class TauriSession implements RuntimeSession {
  setupCSP(_csp: string): void {}
}

class TauriDialog implements RuntimeDialog {
  async showErrorBox(title: string, content: string): Promise<void> {
    try {
      const { message } = await import('@tauri-apps/plugin-dialog')
      await message(`${title}\n\n${content}`, { kind: 'error', title })
    } catch {
      globalThis.alert?.(`${title}\n\n${content}`)
    }
  }
}

class TauriLifecycle implements RuntimeLifecycle {
  onReady(callback: () => void | Promise<void>): void {
    if (globalThis.document?.readyState === 'complete') {
      callback()
    } else {
      globalThis.window?.addEventListener('load', () => callback())
    }
  }

  /** N/A: macOS activate event is not available in Tauri's frontend webview. */
  onActivate(_callback: () => void): void {}

  onBeforeQuit(callback: () => void | Promise<void>): void {
    globalThis.window?.addEventListener('beforeunload', () => callback())
  }

  quit(): void {
    import('@tauri-apps/api/core').then(({ invoke }) => invoke('exit_app')).catch(() => {
      globalThis.window?.close()
    })
  }

  exit(_code?: number): void {
    this.quit()
  }

  getPlatform(): 'windows' | 'mac' | 'linux' {
    const ua = globalThis.navigator?.userAgent || ''
    if (ua.includes('Win')) return 'windows'
    if (ua.includes('Mac')) return 'mac'
    return 'linux'
  }
}

export function createTauriRuntime(): DesktopRuntime {
  return {
    name: 'tauri',
    ipc: new TauriIPC(),
    scopedIPC: new TauriScopedIPC(),
    protocol: new TauriProtocol(),
    window: new TauriWindow(),
    lifecycle: new TauriLifecycle(),
    shell: new TauriShell(),
    app: new TauriApp(),
    session: new TauriSession(),
    dialog: new TauriDialog(),
  }
}

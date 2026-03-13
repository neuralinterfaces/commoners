/**
 * Tauri Runtime Adapter
 *
 * Implements the DesktopRuntime interface for Tauri v2.
 *
 * IMPORTANT: Unlike the Electron adapter (which runs in Node.js main process),
 * this adapter runs in the frontend/webview. Tauri's main process is Rust, not
 * JavaScript, so many main-process concepts are either accessed via @tauri-apps/api
 * or are not applicable.
 *
 * Dependencies (must be installed by the user):
 *   @tauri-apps/api         — core invoke, event, window APIs
 *   @tauri-apps/plugin-shell  — openExternal
 *   @tauri-apps/plugin-dialog — dialog boxes (optional)
 *   @tauri-apps/plugin-opener — URL opener
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

// Helpers for scoped channel naming (matches Electron convention)
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

  removeListener(_channel: string, _listener: (...args: any[]) => void): void {
    // Tauri's event system uses unlisten() via the returned promise,
    // not a removeListener pattern. Use ListenerHandle instead.
  }

  removeAllListeners(_channel: string): void {
    // Not directly supported in Tauri's event system
  }
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
    // In Tauri, "handle" is implemented as listen + emit response
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

class TauriProtocol implements RuntimeProtocol {
  registerScheme(_config: ProtocolSchemeConfig): void {
    // Tauri protocol registration is handled in Rust (tauri.conf.json security.csp)
    // No-op in the frontend adapter
  }

  handleRequest(
    _scheme: string,
    _handler: (req: ProtocolRequest) => Promise<ProtocolResponse | Response>
  ): void {
    // Custom protocol handlers must be defined in Rust (main.rs)
    // No-op in the frontend adapter
  }

  async fetch(url: string): Promise<Response> {
    return globalThis.fetch(url)
  }
}

class TauriWindow implements RuntimeWindow {
  async create(_page?: string, _options?: Record<string, any>): Promise<any> {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const label = `window-${Date.now()}`
    return new WebviewWindow(label, { url: _page, ..._options })
  }

  getById(_id: string | number): any | null {
    // Would need @tauri-apps/api/webviewWindow.getByLabel()
    return null
  }

  getAll(): any[] {
    return []
  }

  restore(): any | null {
    return null
  }

  close(_id: string | number): void {
    // Would need window reference
  }
}

class TauriShell implements RuntimeShell {
  async openExternal(url: string): Promise<void> {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    } catch {
      // Fallback to window.open
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

  setAppUserModelId(_id: string): void {
    // Windows-specific, not applicable in Tauri frontend
  }

  commandLine = {
    appendSwitch(_key: string, _value: string): void {
      // Not applicable in Tauri frontend — command line args are set in Rust
    },
  }
}

class TauriSession implements RuntimeSession {
  setupCSP(_csp: string): void {
    // CSP is configured in tauri.conf.json → app.security.csp
    // No runtime modification from frontend
  }
}

class TauriDialog implements RuntimeDialog {
  showErrorBox(title: string, content: string): void {
    // Use web alert as fallback; @tauri-apps/plugin-dialog could be used if installed
    globalThis.alert?.(`${title}\n\n${content}`)
  }
}

class TauriLifecycle implements RuntimeLifecycle {
  onReady(callback: () => void | Promise<void>): void {
    // In Tauri frontend, the app is ready when the webview loads
    if (globalThis.document?.readyState === 'complete') {
      callback()
    } else {
      globalThis.window?.addEventListener('load', () => callback())
    }
  }

  onActivate(_callback: () => void): void {
    // macOS activate event — not directly available in Tauri frontend
  }

  onBeforeQuit(_callback: () => void | Promise<void>): void {
    globalThis.window?.addEventListener('beforeunload', () => _callback())
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

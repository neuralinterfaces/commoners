/**
 * @commoners/context
 *
 * Cross-platform app context and metadata.
 * Provides a unified API for app info that varies by runtime:
 * - App paths (data, cache, config, temp, documents)
 * - App info (version, name, platform, runtime)
 * - Locale/language
 * - Online status
 *
 * Backend per runtime:
 * - Web: navigator APIs + commoners globals
 * - Electron: app.getPath() + IPC
 * - Tauri: tauri path/os plugins via invoke()
 * - Mobile (Capacitor): @capacitor/app + @capacitor/device
 */

export const capabilities = {
  provides: ['context', 'app-info', 'paths'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

export type AppPaths = {
  data: string | null     // User data directory
  cache: string | null    // Cache directory
  config: string | null   // Config directory
  temp: string | null     // Temporary directory
  documents: string | null // User documents
  home: string | null     // User home directory
}

export type AppInfo = {
  name: string
  version: string
  platform: string    // 'web' | 'electron' | 'tauri' | 'ios' | 'android'
  runtime: string     // 'browser' | 'electron' | 'tauri' | 'capacitor'
  locale: string
  online: boolean
}

// --- Web backend ---

function createWebBackend() {
  const commoners = (globalThis as any).commoners || {}

  return {
    async getInfo(): Promise<AppInfo> {
      return {
        name: commoners.NAME || document.title || 'Unknown',
        version: commoners.VERSION || '0.0.0',
        platform: commoners.MOBILE ? (commoners.MOBILE === 'ios' ? 'ios' : 'android') : 'web',
        runtime: commoners.MOBILE ? 'capacitor' : 'browser',
        locale: navigator.language || 'en',
        online: navigator.onLine,
      }
    },

    async getPaths(): Promise<AppPaths> {
      // Web has no filesystem paths
      return {
        data: null,
        cache: null,
        config: null,
        temp: null,
        documents: null,
        home: null,
      }
    },

    onOnlineChange(callback: (online: boolean) => void): () => void {
      const onOnline = () => callback(true)
      const onOffline = () => callback(false)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
      }
    },
  }
}

// --- Desktop backend: IPC to main process ---

function createDesktopBackend(invoke: Function) {
  return {
    async getInfo(): Promise<AppInfo> {
      return invoke('getInfo')
    },

    async getPaths(): Promise<AppPaths> {
      return invoke('getPaths')
    },

    onOnlineChange(callback: (online: boolean) => void): () => void {
      const onOnline = () => callback(true)
      const onOffline = () => callback(false)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
      }
    },
  }
}

// --- Mobile backend: Capacitor ---

function createCapacitorBackend() {
  const commoners = (globalThis as any).commoners || {}

  return {
    async getInfo(): Promise<AppInfo> {
      let appInfo = { name: commoners.NAME || 'Unknown', version: commoners.VERSION || '0.0.0' }

      try {
        const { App } = await import('@capacitor/app')
        const info = await App.getInfo()
        appInfo = { name: info.name, version: info.version }
      } catch { /* use commoners globals */ }

      let devicePlatform = commoners.MOBILE || 'unknown'
      try {
        const { Device } = await import('@capacitor/device')
        const info = await Device.getInfo()
        devicePlatform = info.platform // 'ios' | 'android' | 'web'
      } catch { /* use commoners globals */ }

      return {
        ...appInfo,
        platform: devicePlatform,
        runtime: 'capacitor',
        locale: navigator.language || 'en',
        online: navigator.onLine,
      }
    },

    async getPaths(): Promise<AppPaths> {
      // Capacitor doesn't expose filesystem paths directly
      // Use @capacitor/filesystem for actual file operations
      return {
        data: null,
        cache: null,
        config: null,
        temp: null,
        documents: null,
        home: null,
      }
    },

    onOnlineChange(callback: (online: boolean) => void): () => void {
      const onOnline = () => callback(true)
      const onOffline = () => callback(false)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
      }
    },
  }
}

// --- Plugin export ---

export default function context() {
  return {
    capabilities,

    isSupported: {
      load: () => true,
    },

    load() {
      const { DESKTOP, MOBILE } = (globalThis as any).commoners || {}

      if (DESKTOP) {
        return createDesktopBackend(this.invoke)
      }

      if (MOBILE) {
        return createCapacitorBackend()
      }

      return createWebBackend()
    },

    // Electron main process: provide paths and app info
    desktop: {
      start: function () {
        this.handle('getInfo', () => {
          const { app } = require('electron')
          return {
            name: app.getName(),
            version: app.getVersion(),
            platform: 'electron',
            runtime: 'electron',
            locale: app.getLocale(),
            online: require('electron').net?.online ?? true,
          }
        })

        this.handle('getPaths', () => {
          const { app } = require('electron')
          return {
            data: app.getPath('userData'),
            cache: app.getPath('cache'),
            config: app.getPath('userData'),
            temp: app.getPath('temp'),
            documents: app.getPath('documents'),
            home: app.getPath('home'),
          }
        })
      },
    },
  }
}

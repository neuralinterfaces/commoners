/**
 * @commoners/notifications
 *
 * Cross-platform notifications.
 *
 * Backend per runtime:
 * - Web: Notification API (with permission request)
 * - Electron: Electron Notification (main process, via IPC)
 * - Tauri: tauri-plugin-notification via invoke() (optional)
 * - Mobile (Capacitor): @capacitor/local-notifications (optional)
 */

export const capabilities = {
  provides: ['notifications', 'alerts'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

export type NotificationOptions = {
  title: string
  body?: string
  icon?: string
  silent?: boolean
}

export type NotificationsPluginOptions = {
  /** Request permission on load (default: false — request on first notify) */
  requestOnLoad?: boolean
}

// --- Web backend: Notification API ---

function createWebBackend() {
  let permissionGranted: boolean | null = null

  async function ensurePermission(): Promise<boolean> {
    if (permissionGranted !== null) return permissionGranted

    if (!('Notification' in globalThis)) {
      permissionGranted = false
      return false
    }

    if (Notification.permission === 'granted') {
      permissionGranted = true
      return true
    }

    if (Notification.permission === 'denied') {
      permissionGranted = false
      return false
    }

    const result = await Notification.requestPermission()
    permissionGranted = result === 'granted'
    return permissionGranted
  }

  return {
    async notify(options: NotificationOptions): Promise<boolean> {
      const allowed = await ensurePermission()
      if (!allowed) return false

      new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        silent: options.silent,
      })
      return true
    },

    async requestPermission(): Promise<boolean> {
      return ensurePermission()
    },

    async isSupported(): Promise<boolean> {
      return 'Notification' in globalThis
    },
  }
}

// --- Desktop backend: IPC to Electron main process ---

function createDesktopBackend(invoke: Function) {
  return {
    async notify(options: NotificationOptions): Promise<boolean> {
      return invoke('notify', options)
    },

    async requestPermission(): Promise<boolean> {
      return true // Electron doesn't require permission
    },

    async isSupported(): Promise<boolean> {
      return true
    },
  }
}

// --- Mobile backend: Capacitor Local Notifications ---

function createCapacitorBackend() {
  let LocalNotifications: any = null

  async function getPlugin() {
    if (!LocalNotifications) {
      try {
        const mod = await import('@capacitor/local-notifications')
        LocalNotifications = mod.LocalNotifications
      } catch {
        return null
      }
    }
    return LocalNotifications
  }

  return {
    async notify(options: NotificationOptions): Promise<boolean> {
      const plugin = await getPlugin()
      if (!plugin) {
        // Fall back to web Notification API
        return createWebBackend().notify(options)
      }

      await plugin.schedule({
        notifications: [{
          title: options.title,
          body: options.body || '',
          id: Date.now(),
        }],
      })
      return true
    },

    async requestPermission(): Promise<boolean> {
      const plugin = await getPlugin()
      if (!plugin) return createWebBackend().requestPermission()

      const { display } = await plugin.requestPermissions()
      return display === 'granted'
    },

    async isSupported(): Promise<boolean> {
      const plugin = await getPlugin()
      return !!plugin || 'Notification' in globalThis
    },
  }
}

// --- Plugin export ---

export default function notifications(options: NotificationsPluginOptions = {}) {
  return {
    capabilities,

    isSupported: {
      load: () => true,
    },

    load() {
      const { DESKTOP, MOBILE } = (globalThis as any).commoners || {}

      let backend: ReturnType<typeof createWebBackend>

      if (DESKTOP) {
        backend = createDesktopBackend(this.invoke)
      } else if (MOBILE) {
        backend = createCapacitorBackend()
      } else {
        backend = createWebBackend()
      }

      // Auto-request permission on load if configured
      if (options.requestOnLoad) {
        backend.requestPermission()
      }

      return backend
    },

    // Electron main process: create native notifications
    desktop: {
      start: function () {
        this.handle('notify', (_: any, options: NotificationOptions) => {
          try {
            const { Notification } = require('electron')
            if (!Notification.isSupported()) return false

            const notification = new Notification({
              title: options.title,
              body: options.body,
              icon: options.icon,
              silent: options.silent,
            })
            notification.show()
            return true
          } catch {
            return false
          }
        })
      },
    },
  }
}

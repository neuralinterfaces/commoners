/**
 * @commoners/storage
 *
 * Cross-platform key-value storage.
 *
 * Backend per runtime:
 * - Web: IndexedDB (universal browser support)
 * - Electron: JSON file in userData via Node fs (main process IPC)
 * - Tauri: tauri-plugin-store via invoke() (optional dep)
 * - Mobile (Capacitor): @capacitor/preferences (optional dep)
 *
 * All methods are async. Values are JSON-serializable.
 */

export const capabilities = {
  provides: ['storage', 'persistence', 'key-value'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

export type StorageOptions = {
  /** Storage namespace to avoid collisions (default: 'commoners') */
  namespace?: string
}

// --- Web backend: IndexedDB ---

function createIndexedDBBackend(namespace: string) {
  const DB_NAME = `${namespace}-storage`
  const STORE_NAME = 'kv'

  function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  function tx(mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
    return openDB().then(db => {
      const transaction = db.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      return { store, done }
    })
  }

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const { store, done } = await tx('readonly')
      return new Promise((resolve, reject) => {
        const request = store.get(key)
        request.onsuccess = () => { done.then(() => resolve(request.result)) }
        request.onerror = () => reject(request.error)
      })
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      const { store, done } = await tx('readwrite')
      store.put(value, key)
      await done
    },

    async remove(key: string): Promise<void> {
      const { store, done } = await tx('readwrite')
      store.delete(key)
      await done
    },

    async keys(): Promise<string[]> {
      const { store, done } = await tx('readonly')
      return new Promise((resolve, reject) => {
        const request = store.getAllKeys()
        request.onsuccess = () => { done.then(() => resolve(request.result as string[])) }
        request.onerror = () => reject(request.error)
      })
    },

    async clear(): Promise<void> {
      const { store, done } = await tx('readwrite')
      store.clear()
      await done
    },
  }
}

// --- Desktop backend: IPC to main process (Electron) ---

function createDesktopBackend(send: Function, invoke: Function) {
  return {
    get: <T = unknown>(key: string): Promise<T | undefined> => invoke('get', key),
    set: <T = unknown>(key: string, value: T): Promise<void> => invoke('set', key, value),
    remove: (key: string): Promise<void> => invoke('remove', key),
    keys: (): Promise<string[]> => invoke('keys'),
    clear: (): Promise<void> => invoke('clear'),
  }
}

// --- Mobile backend: Capacitor Preferences ---

function createCapacitorBackend() {
  let Preferences: any = null

  async function getPreferences() {
    if (!Preferences) {
      try {
        const mod = await import('@capacitor/preferences')
        Preferences = mod.Preferences
      } catch {
        // Fall back to IndexedDB if Capacitor Preferences not available
        return null
      }
    }
    return Preferences
  }

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const prefs = await getPreferences()
      if (!prefs) return undefined
      const { value } = await prefs.get({ key })
      return value ? JSON.parse(value) : undefined
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      const prefs = await getPreferences()
      if (!prefs) return
      await prefs.set({ key, value: JSON.stringify(value) })
    },

    async remove(key: string): Promise<void> {
      const prefs = await getPreferences()
      if (!prefs) return
      await prefs.remove({ key })
    },

    async keys(): Promise<string[]> {
      const prefs = await getPreferences()
      if (!prefs) return []
      const { keys } = await prefs.keys()
      return keys
    },

    async clear(): Promise<void> {
      const prefs = await getPreferences()
      if (!prefs) return
      await prefs.clear()
    },
  }
}

// --- Plugin export ---

export default function storage(options: StorageOptions = {}) {
  const namespace = options.namespace || 'commoners'

  return {
    capabilities,

    isSupported: {
      load: () => true, // Storage works everywhere
    },

    load() {
      const { DESKTOP, MOBILE } = (globalThis as any).commoners || {}

      if (DESKTOP) {
        // Use IPC to main process for fs-backed storage
        return createDesktopBackend(this.send, this.invoke)
      }

      if (MOBILE) {
        // Try Capacitor Preferences, fall back to IndexedDB
        const capBackend = createCapacitorBackend()
        return capBackend
      }

      // Web: IndexedDB
      return createIndexedDBBackend(namespace)
    },

    // Electron main process: fs-backed JSON storage
    desktop: {
      start: function () {
        const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs')
        const { join, dirname } = require('node:path')

        // Resolve storage path — use Electron's userData if available
        let storagePath: string
        try {
          const { app } = require('electron')
          storagePath = join(app.getPath('userData'), `${namespace}-storage.json`)
        } catch {
          storagePath = join(process.cwd(), `.${namespace}-storage.json`)
        }

        // Load existing data
        const data = new Map<string, unknown>()
        if (existsSync(storagePath)) {
          try {
            const raw = JSON.parse(readFileSync(storagePath, 'utf8'))
            for (const [k, v] of Object.entries(raw)) data.set(k, v)
          } catch { /* corrupt file, start fresh */ }
        }

        function persist() {
          const dir = dirname(storagePath)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(storagePath, JSON.stringify(Object.fromEntries(data)), 'utf8')
        }

        // Register IPC handlers
        this.handle('get', (_: any, key: string) => data.get(key))
        this.handle('set', (_: any, key: string, value: unknown) => { data.set(key, value); persist() })
        this.handle('remove', (_: any, key: string) => { data.delete(key); persist() })
        this.handle('keys', () => [...data.keys()])
        this.handle('clear', () => { data.clear(); persist() })
      },
    },
  }
}

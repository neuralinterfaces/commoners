/**
 * @commoners/storage
 *
 * Cross-platform file storage.
 *
 * Backend per runtime:
 * - Web: File System Access API (showOpenFilePicker/showSaveFilePicker) with download fallback
 * - Electron: Node fs via IPC to main process
 * - Tauri: tauri-plugin-fs via invoke() (optional)
 * - Mobile (Capacitor): @capacitor/filesystem (optional)
 *
 * API: read, write, exists, remove, mkdir, readDir
 */

export const capabilities = {
  provides: ['storage', 'filesystem', 'file-access'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

export type FilesystemEncoding = 'utf8' | 'base64' | 'binary'

export type FileInfo = {
  name: string
  path: string
  isDirectory: boolean
  size?: number
}

export type FilesystemOptions = {
  /** Base directory for relative paths on desktop (default: userData) */
  baseDir?: 'userData' | 'documents' | 'temp' | 'home'
}

// --- Web backend: File System Access API + fallbacks ---

function createWebBackend() {
  return {
    async read(path: string, encoding: FilesystemEncoding = 'utf8'): Promise<string | ArrayBuffer> {
      // Web can only read via file picker
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker()
        const file = await handle.getFile()
        if (encoding === 'binary') return await file.arrayBuffer()
        return await file.text()
      }
      throw new Error('File reading requires the File System Access API (Chrome/Edge) or a desktop build')
    },

    async write(path: string, data: string | ArrayBuffer, encoding: FilesystemEncoding = 'utf8'): Promise<void> {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: path.split('/').pop() || 'file',
        })
        const writable = await handle.createWritable()
        await writable.write(data)
        await writable.close()
        return
      }
      // Fallback: trigger download
      const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : new Blob([data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.split('/').pop() || 'file'
      a.click()
      URL.revokeObjectURL(url)
    },

    async exists(): Promise<boolean> {
      return false // Web cannot check arbitrary file existence
    },

    async remove(): Promise<void> {
      throw new Error('File removal is not available on web')
    },

    async mkdir(): Promise<void> {
      throw new Error('Directory creation is not available on web')
    },

    async readDir(): Promise<FileInfo[]> {
      throw new Error('Directory listing is not available on web')
    },
  }
}

// --- Desktop backend: IPC to Electron main process ---

function createDesktopBackend(invoke: Function) {
  return {
    read: (path: string, encoding: FilesystemEncoding = 'utf8') => invoke('read', path, encoding),
    write: (path: string, data: string | ArrayBuffer, encoding: FilesystemEncoding = 'utf8') => invoke('write', path, data, encoding),
    exists: (path: string) => invoke('exists', path),
    remove: (path: string) => invoke('remove', path),
    mkdir: (path: string) => invoke('mkdir', path),
    readDir: (path: string) => invoke('readDir', path),
  }
}

// --- Mobile backend: Capacitor Filesystem ---

function createCapacitorBackend() {
  let Filesystem: any = null
  let Directory: any = null

  async function getPlugin() {
    if (!Filesystem) {
      try {
        const mod = await import('@capacitor/filesystem')
        Filesystem = mod.Filesystem
        Directory = mod.Directory
      } catch {
        return null
      }
    }
    return Filesystem
  }

  return {
    async read(path: string, encoding: FilesystemEncoding = 'utf8'): Promise<string> {
      const fs = await getPlugin()
      if (!fs) throw new Error('@capacitor/filesystem not available')
      const result = await fs.readFile({ path, directory: Directory.Documents, encoding })
      return result.data
    },

    async write(path: string, data: string, encoding: FilesystemEncoding = 'utf8'): Promise<void> {
      const fs = await getPlugin()
      if (!fs) throw new Error('@capacitor/filesystem not available')
      await fs.writeFile({ path, data, directory: Directory.Documents, encoding })
    },

    async exists(path: string): Promise<boolean> {
      const fs = await getPlugin()
      if (!fs) return false
      try {
        await fs.stat({ path, directory: Directory.Documents })
        return true
      } catch {
        return false
      }
    },

    async remove(path: string): Promise<void> {
      const fs = await getPlugin()
      if (!fs) throw new Error('@capacitor/filesystem not available')
      await fs.deleteFile({ path, directory: Directory.Documents })
    },

    async mkdir(path: string): Promise<void> {
      const fs = await getPlugin()
      if (!fs) throw new Error('@capacitor/filesystem not available')
      await fs.mkdir({ path, directory: Directory.Documents, recursive: true })
    },

    async readDir(path: string): Promise<FileInfo[]> {
      const fs = await getPlugin()
      if (!fs) return []
      const result = await fs.readdir({ path, directory: Directory.Documents })
      return result.files.map((f: any) => ({
        name: f.name,
        path: `${path}/${f.name}`,
        isDirectory: f.type === 'directory',
        size: f.size,
      }))
    },
  }
}

// --- Plugin export ---

export default function filesystem(options: FilesystemOptions = {}) {
  const baseDir = options.baseDir || 'userData'

  return {
    capabilities,

    isSupported: {
      load: () => true,
    },

    load() {
      const { DESKTOP, MOBILE } = (globalThis as any).commoners || {}

      if (DESKTOP) return createDesktopBackend(this.invoke)
      if (MOBILE) return createCapacitorBackend()
      return createWebBackend()
    },

    desktop: {
      start: function () {
        const { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, statSync } = require('node:fs')
        const { join, dirname } = require('node:path')
        const { app } = require('electron')

        const basePath = app.getPath(baseDir)

        function resolvePath(path: string): string {
          if (require('node:path').isAbsolute(path)) return path
          return join(basePath, path)
        }

        this.handle('read', (_: any, path: string, encoding: string) => {
          const resolved = resolvePath(path)
          if (encoding === 'binary') return readFileSync(resolved)
          return readFileSync(resolved, encoding as BufferEncoding)
        })

        this.handle('write', (_: any, path: string, data: string | Buffer, encoding: string) => {
          const resolved = resolvePath(path)
          const dir = dirname(resolved)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(resolved, data, encoding === 'binary' ? undefined : (encoding as BufferEncoding))
        })

        this.handle('exists', (_: any, path: string) => existsSync(resolvePath(path)))

        this.handle('remove', (_: any, path: string) => unlinkSync(resolvePath(path)))

        this.handle('mkdir', (_: any, path: string) => mkdirSync(resolvePath(path), { recursive: true }))

        this.handle('readDir', (_: any, path: string) => {
          const resolved = resolvePath(path)
          const entries = readdirSync(resolved, { withFileTypes: true })
          return entries.map(e => ({
            name: e.name,
            path: join(resolved, e.name),
            isDirectory: e.isDirectory(),
            size: e.isFile() ? statSync(join(resolved, e.name)).size : undefined,
          }))
        })
      },
    },
  }
}

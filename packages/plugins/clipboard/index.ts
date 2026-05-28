/**
 * @commoners/clipboard
 *
 * Cross-platform clipboard access.
 *
 * Backend per runtime:
 * - Web: navigator.clipboard API (requires secure context)
 * - Electron: electron.clipboard via IPC to main process
 * - Mobile (Capacitor): @capacitor/clipboard (optional)
 *
 * API: readText, writeText, readImage, writeImage
 */

export const capabilities = {
  provides: ['clipboard'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

// --- Web backend: navigator.clipboard ---

function createWebBackend() {
  return {
    async readText(): Promise<string> {
      return navigator.clipboard.readText()
    },

    async writeText(text: string): Promise<void> {
      await navigator.clipboard.writeText(text)
    },

    async readImage(): Promise<Blob | null> {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'))
          if (imageType) return await item.getType(imageType)
        }
      } catch { /* clipboard read may be denied */ }
      return null
    },

    async writeImage(blob: Blob): Promise<void> {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
    },
  }
}

// --- Desktop backend: IPC to Electron main process ---

function createDesktopBackend(invoke: Function) {
  return {
    readText: () => invoke('readText'),
    writeText: (text: string) => invoke('writeText', text),
    readImage: () => invoke('readImage'),
    writeImage: (dataURL: string) => invoke('writeImage', dataURL),
  }
}

// --- Mobile backend: Capacitor Clipboard ---

function createCapacitorBackend() {
  let Clipboard: any = null

  async function getPlugin() {
    if (!Clipboard) {
      try {
        const mod = await import('@capacitor/clipboard')
        Clipboard = mod.Clipboard
      } catch {
        return null
      }
    }
    return Clipboard
  }

  return {
    async readText(): Promise<string> {
      const plugin = await getPlugin()
      if (!plugin) return navigator.clipboard.readText()
      const { value } = await plugin.read()
      return value
    },

    async writeText(text: string): Promise<void> {
      const plugin = await getPlugin()
      if (!plugin) return navigator.clipboard.writeText(text)
      await plugin.write({ string: text })
    },

    async readImage(): Promise<Blob | null> {
      // Capacitor Clipboard doesn't support image read
      return null
    },

    async writeImage(): Promise<void> {
      // Capacitor Clipboard doesn't support image write
    },
  }
}

// --- Plugin export ---

export default function clipboard() {
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
        const { clipboard, nativeImage } = require('electron')

        this.handle('readText', () => clipboard.readText())

        this.handle('writeText', (_: any, text: string) => clipboard.writeText(text))

        this.handle('readImage', () => {
          const image = clipboard.readImage()
          if (image.isEmpty()) return null
          return image.toDataURL()
        })

        this.handle('writeImage', (_: any, dataURL: string) => {
          const image = nativeImage.createFromDataURL(dataURL)
          clipboard.writeImage(image)
        })
      },
    },
  }
}

export const capabilities = {
  provides: ['autoupdate', 'auto-update'],
  platforms: { desktop: true },
}

export const isSupported = {
  start: ({ DESKTOP }) => !!DESKTOP,
}

export function load() {
  return {
    onAvailable: (callback) => {
      this.on('available', callback)
    },
    onDownloaded: (callback) => {
      this.on('downloaded', callback)
    },
    restart: () => {
      this.send('restart')
    },
  }
}

export const desktop = {
  load: function (win) {
    const electronUpdater = require('electron-updater')
    const { autoUpdater } = electronUpdater

    autoUpdater.channel = 'latest'
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      this.send('available', info)
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.send('downloaded', info)
    })

    autoUpdater.on('error', (err) => {
      console.error('[autoupdate] Error checking for updates:', err?.message || err)
    })

    this.on('restart', () => autoUpdater.quitAndInstall())

    win.once('ready-to-show', () => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[autoupdate] Failed to check for updates:', err?.message || err)
      })
    })
  },
}

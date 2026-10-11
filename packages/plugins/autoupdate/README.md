# @commoners/autoupdate

Auto-update plugin for Commoners desktop applications. Uses [electron-updater](https://www.electron.build/auto-update) to check for updates on app launch.

## Usage

```js
// commoners.config.ts
import autoupdate from '@commoners/autoupdate'

export default {
  plugins: { autoupdate }
}
```

## Configuration

The plugin uses `electron-updater`'s default behavior:
- Checks for updates when the app window is ready
- Downloads updates automatically in the background
- Installs on next app quit

Configure the update server via `electron-builder`'s [publish](https://www.electron.build/publish) config in your commoners config:

```js
export default {
  electron: {
    build: {
      publish: {
        provider: 'github',
        owner: 'your-org',
        repo: 'your-app'
      }
    }
  }
}
```

## Renderer API

```js
const { autoupdate } = await commoners.READY

// Listen for update availability
autoupdate.onAvailable((info) => {
  console.log('Update available:', info.version)
})

// Listen for download completion
autoupdate.onDownloaded((info) => {
  console.log('Update ready:', info.version)
})

// Trigger restart to install
autoupdate.restart()
```

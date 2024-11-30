# @commoners/windows
A plugin for spawning multiple windows in your Commoners application

## Usage
```js
import windowsPlugin from '@commoners/windows'

export default {
    plugins: {
        windows: windowsPlugin({
            popup: { 
                src: "popup.html"
                window: { width: 500, height: 500 }
            }
        })
    }
}
```

## Notes
1. The popups inherit from the Commoners configuration
    - All properties other than `src` act as overrides to merge with the original configuration. Excludes `plugins`.
2. `electron.window` property applies to both the Electron and Web windows.

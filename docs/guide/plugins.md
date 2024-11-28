# Plugins
Plugins are collections of JavaScript functions that run at different points during app initialization. These points include:

1. `load` - After the DOM is loaded 
2. `desktop.start` - Run on application launch (`--desktop` builds only)
3. `desktop.ready` - Run after the application is ready (`--desktop` builds only)
4. `desktop.load` - Run after each window is created in the application (`--desktop` builds only)
5. `desktop.unload` - Run after each window is closed (`--desktop` builds only)
6. `desktop.end` - Run before the app exits (`--desktop` builds only)

> **Note:** Official plugins can be found in the `@commoners` namespace on NPM, and are listed in the [official plugins](../packages/plugins.md#official-plugins) section.

To add a new plugin, simply provide a named `Plugin` on the `plugins` registry of your [Configuration File](./config.md):
```js
export default {
    plugins: {
        selectiveBuild: {
            isSupported: {
                web: {
                    load: false
                }
            },
            load: () => console.log(commoners.target + ' build (load)'),
            desktop: {
                load: () => console.log('desktop build (load)'),
                unload: () => console.log('desktop build (unload)')
            }
        }
    }
}
```

To use a plugin, you should check for the existence of the plugin, which *may* have a return value stored in the `PLUGINS` property.

However, some plugins are asynchronously loaded. You can use the `READY` promise to ensure you're working with the resolved plugins:

```js

    const { READY } = commoners
    READY.then(({ selectiveBuild }) => {
        if (selectiveBuild) console.log('Loaded!')
    })
```

Global variables will be loaded from your `.env` file (if present). which you can use in `desktop` load functions.
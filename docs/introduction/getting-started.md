# Getting Started
`commoners` allows anyone to build their application for web, desktop, and mobile.

## Services
Services are independent processes that the main application depends on. These may be `local` or `remote` based on the distributed application files.

> **Note:** `commoners` currently supports `.js`, `.ts`, `.py`, `.exe`, and `.pkg` services.

To declare a service, you simply add the source file path to the `commoners.config.js` file:
```js
export default {
    services: {
        test: './services/test/index.ts'
    },
}
```

To use a service, you should (1) check for the existence of the service, then (2) instantiate the appropriate URL from the `COMMONERS` global object:

```js
    if ('test' in COMMMONERS.services) {
        const url = new URL(COMMONERS.services.test.url)
        // ....
    }
```

If your service will be accessible from a particular URL, you'll want to make sure that the `port` used is derived from the `PORT` environment variable:

```js
const port = process.env.PORT || 3000
```

### Using Services in Production
Service configurations may be different between development and production. For instance, `.py` services are commonly packaged using `pyinstaller`, which will output an `.exe` / `.pkg` file that includes all dependencies.

The following service structure would be used to handle this case:

> **Note:** The entirety of the `--outDir` (default: `dist`) folder is copied as extra resources to Electron. Include any required assets there.
```json
{
    "src": "src/main.py",
    "publish": {
        "build": {
            "mac": "python -m PyInstaller --name test --onedir --clean ./src/main.py --distpath ./dist/pyinstaller",
        },
        "local": {
            "src": "./dist/pyinstaller/test/test"
        }
    }
}
```

## Plugins
Plugins are collections of JavaScript functions that run at different points during app initialization. These points include:
1. `main` - Immediately on Electron main process instantiation (`desktop` builds only)
2. `preload` - Before the DOM is loaded 
3. `render` - After the DOM is loaded 

To declare a plugin, you simply add the relevant configuration object in the `plugins` array of the `commoners.config.js` file:
```js
export default {
    plugins: [
        {
            name: 'selective-builds',
            isSupported: {
                desktop: {
                    render: false,
                    preload: false
                },
                mobile: {
                    render: false
                },
                web: {
                    preload: false
                }
            },
            main: () => console.log('desktop build (main)'),
            preload: () => console.log(COMMONERS.TARGET + ' build (preload)'),
            render: () => console.log(COMMONERS.TARGET + ' build (render)'),
        }
    ]
}
```

To use a plugin, you should check for the existence of the plugin, which *may* have a return value separately stored in the `plugins.loaded` and `plugins.rendered` propreties:

```js
    if ('test' in COMMMONERS.plugins.loaded) {
        const loadedPlugin = COMMMONERS.plugins.loaded.test
        const renderedPlugin = COMMMONERS.plugins.loaded.rendered
        // ....
    }
```

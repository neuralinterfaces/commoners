# Getting Started
`commoners` allows anyone to build their application for web, desktop, and mobile.

## Build Targets
`commoners` relies on [Vite](https://vitejs.dev) to generate the essential frontend files for each build target.

### Web
Web builds are the default build target. These builds are intended to be deployed to a web server, and are accessible from any device with a web browser.

#### PWA
Progressive Web Apps (PWAs) are web applications that can be installed on a device and accessed from the home screen. PWAs are supported on most modern browsers, and can be installed on both desktop and mobile devices—though they will have limited access to native features.

`commoners` relies on [vite-plugin-pwa]() to generate the necessary files for a PWA. To enable this feature, simply add the `--pwa` flag to your build command.

### Desktop
Desktop builds are intended to be installed on a user's computer. These builds are accessible from the desktop, and have access to native features.

`commoners` relies on [Electron](https://www.electronjs.org) to generate the necessary files for a desktop application. To enable this feature, simply add the `--desktop` flag to your build command.


### Mobile
Mobile builds are intended to be installed on a user's mobile device. These builds are accessible from the home screen, and have access to native features.

`commoners` relies on [Capacitor](https://capacitorjs.com) to generate the necessary files for a mobile application. To enable this feature, simply add the `--mobile` flag to your build command.

#### iOS
If you are building for iOS, you will need to install the following dependencies:
- [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12)
- [CocoaPods](https://cocoapods.org)

> **Note:** If your pods are not installed automatically, you may need to update gems (`sudo gem update --system`) and / or reinstall an older version of CocoaPods (`sudo gem install cocoapods:1.10.2`) for the CLI tool to properly initialize your project.

#### Android
If you are building for Android, you will need to install the following dependencies:
- [Android Studio](https://developer.android.com/studio)

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

> **Note:** Official plugins can be found in the `@commoners` namespace on NPM, and are listed in the [official plugins](/plugins/official) section.

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

For code executed in the `main` function, there are several global variables available to you by default:

- `COMMONERS_PLATFORM` - The current build platform (`mac`, `windows`, `linux`, `ios`, or `android`)
- `COMMONERS_TARGET` - The current build target (`desktop`, `mobile`, or `web`)
- `COMMONERS_MODE` - The current build mode (`development`, `local`, or `remote`)

Additional global variables will be loaded from your `.env` file, if present.
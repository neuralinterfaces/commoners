# commoners
A Cross-Platform Development Kit for Everyone

 The `commoners` CLI allows anyone to build their application for multiple platforms.

 Our particular goal has been to develop a simple tool for building web, desktop, and mobile applications that connect to Bluetooth and USB biosensing devices. 
 
 As such, `commoners` has been battle-tested against this use-case.

## Commands
- `commoners start` - Start your project in an Electron application.

- `commoners dev` - Start your project in your default browser

- `commoners build` - Build the project assets
    - `--desktop` - For your current desktop platform
    - `--pwa` - As a Progressive Web App (PWA)
    - `--ios` - For iOS
    - `--android` - For Android

- `commoners launch` - Launch your built application (default: `commoners dev`)
    - `--desktop` - Start your desktop build
    - `--ios` - Open the project with XCode (coming soon)
    - `--android` - Open the project with Android Studio (coming soon)

- `commoners commit` - Commit your latest build to Github (coming soon)
- `commoners publish` - Publish your latest commit to Github Pages (coming soon)
    - `--message` - Add a commit message and trigger a new commit

## Configuration Options
- `services` - An object that declares backend services to run
```js
export default {
    services: {
        myservice: './backend/index.ts'
    },
}
```

- `plugins` - An object that declares the plugins to activate for this project. 
```js
export default {
    plugins: [
        {
            name: 'test',
            electronOnly: false,
            main: () => console.log('ELECTRON BUILD (main)'),
            preload: () => console.log('ALL BUILDS (preload)'),
            renderer: () => console.log('ALL BUILDS (renderer)')
        }
    ]
}
```


## Service Types
### Python
You'll likely want to package your service using `pyinstaller`, which will output an executable file that includes all dependencies.

To swap between development and production files, you can use the following service structure:
```json
{
    "src": "src/main.py",
    "publish": {
        "build": {
            "mac": "python -m PyInstaller --name test --onedir --clean ./src/main.py --distpath ./dist/pyinstaller",
        },
        "desktop": {
            "src": "./pyinstaller/test", 
            "extraResources": [ 
                {
                    "from": "./dist/pyinstaller/test",
                    "to": "pyinstaller"
                }
            ]
        }
    }
}
```

## Build Notes
### iOS
## Fix Pods Issue
Close XCode and run the following commands on the terminal:
```
cd ios/App
pod install
```

Then open XCode again and try again.
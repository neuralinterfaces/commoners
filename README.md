# commoners
A Cross-Platform Development Kit for Everyone

 The `commoners` CLI allows anyone to build their application for multiple platforms.

 Our particular goal has been to develop a simple tool for building web, desktop, and mobile applications that connect to Bluetooth and USB biosensing devices. 
 As such, `commoners` has been battle-tested against this use-case.

## Commands
- `commoners build` - Build the project
    - `--desktop` - Build for your current desktop platform
    - `--pwa` - Build as a PWA (coming soon)
    - `--ios` - Build for iOS (coming soon)
    - `--android` - Build for Android (coming soon)

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
> **Note:** The object provided will be used to configure the `capacitor` plugin only.

```js
export default {
    plugins: {
        
        bluetooth: {
            displayStrings: {
                scanning: "Scanning BLE...",
                cancel: "Stop Scanning",
                availableDevices: "Devices available!",
                noDeviceFound: "No BLE devices found."
            }
        },

        customplugin: true
    }
}
```

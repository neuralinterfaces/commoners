# @commoners/bluetooth
A plugin for connecting to Bluetooth Low Energy devices across **all platforms** using the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) (web, desktop) or Capacitor's `@capacitor-community/bluetooth-le` plugin (web, desktop, mobile)

## Usage
```js
import bluetoothPlugin from '@commoners/bluetooth'

export default {
    plugins: [ bluetoothPlugin ]
}
```

## Mobile Support
To use the BLE plugin on mobile, you must: 
1. Implement your Bluetooth code using the [`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) package.
2. Explicitly include the `@capacitor-community/bluetooth-le` package in your project.
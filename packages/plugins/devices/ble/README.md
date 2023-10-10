# @commoners/bluetooth
A plugin for connecting to Bluetooth Low Energy devices across **all platforms** using the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) (web, desktop) or Capacitor's `@capacitor-community/bluetooth-le` plugin (web, desktop, mobile)

> **Note:** To use the BLE plugin on mobile, you must implement your Bluetooth code using the [`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) package. This plugin will automatically handle the configuration—but **you must write the code yourself**.

## Example
```js
import bluetoothPlugin from '@commoners/bluetooth'

export default {
    plugins: [ bluetoothPlugin ]
}
```
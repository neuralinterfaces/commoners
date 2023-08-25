import { generateModal } from '../common.js'

export const name = 'bluetooth'

export const capacitor = {
  name: 'BluetoothLe',
  package: { name: '@capacitor-community/bluetooth-le', version: '~3.0.0' },
  options: {
    displayStrings: {
      scanning: "Scanning BLE...",
      cancel: "Stop Scanning",
      availableDevices: "Devices available!",
      noDeviceFound: "No BLE devices found."
    }
  }
}

export const isSupported = async () => await navigator.bluetooth.getAvailability() // Check if BLE is available on web builds

export function main (
  // this: IpcMain, 
  win//: BrowserWindow
) {

    // Enable Web Bluetooth
    let selectBluetoothCallback;

    this.on("bluetooth.select", (
      _evt, //: IpcMainEvent, 
      value //: string
    ) => {
        if (typeof selectBluetoothCallback === 'function') selectBluetoothCallback(value)
        selectBluetoothCallback = null
    });

    // NOTE: For handling additional permissions that rarely crop up. Automatically confirm
    win.webContents.session.setBluetoothPairingHandler((details, callback) => {
      if (details.pairingKind === 'confirm') callback({ confirmed: true })
      else console.error(`COMMONERS Bluetooth Extension does not support devices that need ${details.pairingKind} permissions.`)
    })

    win.webContents.on('select-bluetooth-device', (event, devices, callback) => {


      event.preventDefault()
      
      if (!selectBluetoothCallback) win.webContents.send("bluetooth.open", devices); // Initial request always starts at zero

      win.webContents.send("bluetooth.update", devices);

      selectBluetoothCallback = callback

    })

}

export function preload(
  // this: IpcRenderer
) {
    return {
        onOpen: (callback) =>this.on("bluetooth.open", () => callback()),
        onUpdate: (callback) => this.on("bluetooth.update", (_, devices) => callback(devices)),
        select: (deviceID) => this.send("bluetooth.select", deviceID),
    }
}

export function renderer({ onOpen, onUpdate, select }) {

  const modal = generateModal({
    headerText: `Available BLE Devices`,
    mapDeviceToInfo: (o) => {
      return {
        name: o.deviceName,
        id: o.deviceId
      }
    },

    onClose: (device) => select(device)
  })

  let latestDevices = ''

  onOpen(() => {
    modal.close();
    modal.showModal(); // avoid error
  })

  onUpdate((devices) => {
    if (latestDevices !== JSON.stringify(devices)) {
      latestDevices = JSON.stringify(devices)
      modal.update(devices)
    }
  })

  document.body.append(modal)

  return { modal }
}
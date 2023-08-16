import { generateModal } from '../common.js'

export const name = 'bluetooth'

export const capacitorName = 'BluetoothLe'

export function main (
  // this: IpcMain, 
  win//: BrowserWindow
) {

    // Enable Web Bluetooth
    let selectBluetoothCallback;

    this.on("bluetooth.selectDevice", (
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
      if (!devices.length) win.webContents.send("bluetooth.open", devices); // Initial request always starts at zero
      event.preventDefault()
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

  onOpen(() => modal.showModal())

  onUpdate((devices) => {
    if (latestDevices !== JSON.stringify(devices)) {
      latestDevices = JSON.stringify(devices)
      modal.update(devices)
    }
  })

  document.body.append(modal)

  return { modal }
}
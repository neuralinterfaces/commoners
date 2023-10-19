import createModal from '../modal.js'

export const name = 'bluetooth'

// @capacitor-community/bluetooth-le must be installed by the user

export const isSupported = {
  desktop: true,
  mobile: {
    capacitor: {
      name: 'BluetoothLe',
      plugin: '@capacitor-community/bluetooth-le', // Must be installed by the user
      options: {
        displayStrings: {
          scanning: "Scanning BLE...",
          cancel: "Stop Scanning",
          availableDevices: "Devices available!",
          noDeviceFound: "No BLE devices found."
        }
      }
    },
    load: false
  },
  web: {
    check: async () => await navigator.bluetooth.getAvailability(),
    load: false
  }
}

export function loadDesktop ( win ) {

    // Enable Web Bluetooth
    let selectBluetoothCallback;

    this.on(`${name}.select`, (
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
      
      if (!selectBluetoothCallback) win.webContents.send(`${name}.open`, devices); // Initial request always starts at zero

      win.webContents.send(`${name}.update`, devices);

      selectBluetoothCallback = callback

    })

}

export function load() {

  const onOpen = (callback) => this.on(`${name}.open`, () => callback())

  const onUpdate = (callback) => this.on(`${name}.update`, (_, devices) => callback(devices))

  const select = (deviceID) => this.send(`${name}.select`, deviceID)

  const modal = createModal({
    headerText: 'Available BLE Devices',
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

  return { 
    onOpen, 
    onUpdate,
    select,
    modal 
  }
}
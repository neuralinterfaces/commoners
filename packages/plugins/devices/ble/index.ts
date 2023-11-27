import createModal from '../modal.js'

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
    check: async () => (await navigator.bluetooth?.getAvailability()) === true,
    load: false
  }
}

export const desktop = {
  load: function ( win ) {

      // Enable Web Bluetooth
      let selectBluetoothCallback;

      this.on(`select`, (
        _evt, //: IpcMainEvent, 
        value //: string
      ) => {
          if (typeof selectBluetoothCallback === 'function') selectBluetoothCallback(value)
          selectBluetoothCallback = null
      });

      // NOTE: For handling additional permissions that rarely crop up. Automatically confirm
      win.webContents.session.setBluetoothPairingHandler((details, callback) => {
        if (details.pairingKind === 'confirm') callback({ confirmed: true })
        else console.error(`Commoners Bluetooth Extension does not support devices that need ${details.pairingKind} permissions.`)
      })

      win.webContents.on('select-bluetooth-device', (event, devices, callback) => {

        event.preventDefault()
        
        if (!selectBluetoothCallback) this.send(`open`, devices); // Initial request always starts at zero

        this.send(`update`, devices);

        selectBluetoothCallback = callback

      })

  }
}

export function load() {

  const onOpen = (callback) => this.on(`open`, () => callback())

  const onUpdate = (callback) => this.on(`update`, (_, devices) => callback(devices))

  const select = (deviceID) => this.send(`select`, deviceID)

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
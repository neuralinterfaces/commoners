import createModal from '../modal.js'

type MACAddress = string

type DeviceInformation = {
  name: string,
  deviceId: string
}

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

type States = {
  select: ((id: MACAddress) => void) | null ,
  match: DeviceInformation | null
}

export const desktop = {
  load: function ( win ) {

    const states: States = { select: null, match: null }

      const match = (value: DeviceInformation) => states.match = value

      const select = (value: MACAddress | '') => {
          if (typeof states.select === 'function') {
            states.select(value) // Select the device by MAC Address, or cancel device selection
            this.send(`selected`, value) // Notify the renderer that a device was selected
          }
          states.select = null
          states.match = null
      }

      this.on(`match`, (_evt, value: DeviceInformation) => match(value))
      this.on(`select`, ( _evt, value: MACAddress) => select(value));

      // NOTE: For handling additional permissions that rarely crop up. Automatically confirm
      win.webContents.session.setBluetoothPairingHandler((details, callback) => {
        if (details.pairingKind === 'confirm') callback({ confirmed: true })
        else console.error(`Commoners Bluetooth Plugin does not support devices that need ${details.pairingKind} permissions.`)
      })
      

      win.webContents.on('select-bluetooth-device', (event, devices, callback) => {

        event.preventDefault()

        const newRequest = !states.select
        states.select = callback

        // If a device was saved to select later, select it now

        const { match } = states

        if (match) {

          // Match by name
          const hasMatch = devices.find(device => {
            if (match.name && device.deviceName !== match.name) return false
            return true
          })

          if (hasMatch) select(hasMatch.deviceId)
          return
        } 
        
        // Open the device modal and update it with the available devices
        if (newRequest) this.send(`open`, devices); // Initial request always starts at zero
        this.send(`update`, devices);
      })

  }
}

export function load() {

  const onOpen = (callback) => this.on(`open`, () => callback())

  const onUpdate = (callback) => this.on(`update`, (_, devices) => callback(devices))

  this.on(`selected`, () => {
    if (matchTimeout) clearTimeout(matchTimeout)
      matchTimeout = null
  })

  const onSelect = (callback) => this.on(`selected`, (_, id) => callback(id))

  let matchTimeout;

  const select = (deviceID: MACAddress) => this.send(`select`, deviceID)

  const match = (
    device: DeviceInformation,
    timeout?: number
  ) => {
    
    this.send(`match`, device)

    if (!timeout) return
    
    matchTimeout = setTimeout(
      () => commoners.plugins.bluetooth.cancel(),
      timeout
    )

  }

  const cancel = () => this.send(`select`, '')

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
    onSelect,
    select,
    match,
    cancel,
    modal 
  }
}
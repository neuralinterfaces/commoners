import createModal from '../modal.js'

type MACAddress = string

type DeviceInformation = {
  name: string,
  deviceId: string
}

// @capacitor-community/bluetooth-le must be installed by the user
export const isSupported = {

  mobile: {
    capacitor: {
      name: 'BluetoothLe',
      plugin: '@capacitor-community/bluetooth-le', // Must be installed by the user


      // The following configuration is automatically added to the plist file
      plist: {
        NSBluetoothAlwaysUsageDescription: "Uses Bluetooth to connect and interact with peripheral BLE devices.",
        UIBackgroundModes: ["bluetooth-central"]
      },


      // NOTE: Make sure tosSet the androidNeverForLocation flag when initializing the BleClient.
      manifest: {
        'uses-permission': [
          { 'android:name': 'android.permission.ACCESS_COARSE_LOCATION', 'android:maxSdkVersion': '30' },
          { 'android:name': 'android.permission.ACCESS_FINE_LOCATION', 'android:maxSdkVersion': '30' },
          {
            'android:name': 'android.permission.BLUETOOTH_SCAN',
            'android:usesPermissionFlags': 'neverForLocation',
            'tools:targetApi': 's'
          }
        ]
      },

      options: {
        displayStrings: {
          scanning: "Scanning BLE...",
          cancel: "Stop Scanning",
          availableDevices: "Devices available!",
          noDeviceFound: "No BLE devices found."
        }
      }
    }
  },

  web: async () => (await navigator.bluetooth?.getAvailability()) === true
}

export const desktop = {
  load: function ( win ) {

    const { webContents, __id } = win
    const { session } = webContents

      const WIN_STATES: {
        select?: Function,
        match?: DeviceInformation
      } = {}

      const match = (value: DeviceInformation) => WIN_STATES.match = value

      const selectDevice = (value: MACAddress | '') => {
          const { select } = WIN_STATES
          if (typeof select === 'function') {
            select(value) // Select the device by MAC Address, or cancel device selection
            this.send(`${__id}:selected`, value) // Notify the renderer that a device was selected
          }

          delete WIN_STATES.select
          delete WIN_STATES.match
      }
  
      this.on(`${__id}:match`, (_evt, value: DeviceInformation) => match(value))
      this.on(`${__id}:select`, ( _evt, value: MACAddress) => selectDevice(value));

      // NOTE: For handling additional permissions that rarely crop up. Automatically confirm
      session.setBluetoothPairingHandler((details, callback) => {
        if (details.pairingKind === 'confirm') callback({ confirmed: true })
        else console.error(`Commoners Bluetooth Plugin does not support devices that need ${details.pairingKind} permissions.`)
      })
      

      webContents.on('select-bluetooth-device', (event, devices, callback) => {

        event.preventDefault()

        const newRequest = !WIN_STATES.select
        WIN_STATES.select = callback

        // If a device was saved to select later, select it now

        const { match } = WIN_STATES

        if (match) {

          // Match by name
          const hasMatch = devices.find(device => {
            if (match.name && device.deviceName !== match.name) return false
            return true
          })

          if (hasMatch) selectDevice(hasMatch.deviceId)
          return
        } 
        
        // Open the device modal and update it with the available devices
        if (newRequest) this.send(`${__id}:open`, devices); // Initial request always starts at zero
        this.send(`${__id}:update`, devices);
      })
  }
}

export function load() {

  const { DESKTOP } = commoners

  if (!DESKTOP) return

  const { __id } = DESKTOP

  const onOpen = (callback) => this.on(`${__id}:open`, () => callback())

  const onUpdate = (callback) => this.on(`${__id}:update`, (_, devices) => callback(devices))

  this.on(`${__id}:selected`, () => {
    if (matchTimeout) clearTimeout(matchTimeout)
      matchTimeout = null
  })

  const onSelect = (callback) => this.on(`${__id}:selected`, (_, id) => callback(id))

  let matchTimeout;

  const select = (deviceID: MACAddress) => this.send(`${__id}:select`, deviceID)

  const match = (
    device: DeviceInformation,
    timeout?: number
  ) => {

    if (!device) return
    
    this.send(`${__id}:match`, device)

    if (!timeout) return
    
    matchTimeout = setTimeout(
      () => cancel(),
      timeout
    )
  }

  const cancel = () => this.send(`${__id}:select`, '')

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
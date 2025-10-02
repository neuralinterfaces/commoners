export async function connect() {
  try {
    const { MOBILE } = commoners

    // Use Capacitor plugin on mobile (iOS/Android)
    if (MOBILE) {
      const { BleClient } = await import('@capacitor-community/bluetooth-le')

      // Initialize the BLE client
      await BleClient.initialize()

      console.log('BLE initialized, requesting device...')

      // Request a device - the plugin will show native device picker
      await BleClient.requestDevice({
        // Optionally filter by services
        // services: ['battery_service']
        namePrefix: '', // Show all devices
      })

      console.log('Device selected from picker')

      // Note: requestDevice in capacitor-community/bluetooth-le doesn't return a device
      // Instead, it shows a native picker and you need to handle the selection differently
      // For scanning and connecting, use the scan API instead:

      const devices = []

      console.log('Starting BLE scan...')

      await BleClient.requestLEScan(
        {
          // Optional service filter
          // services: ['battery_service']
        },
        (result) => {
          console.log('Device found:', result)
          devices.push(result)

          // Connect to first device found (for demo purposes)
          if (devices.length === 1) {
            BleClient.stopLEScan()
            connectToDevice(result.device.deviceId)
          }
        }
      )

      async function connectToDevice(deviceId) {
        try {
          console.log('Connecting to device:', deviceId)

          await BleClient.connect(deviceId, (disconnected) => {
            console.log('Device disconnected:', disconnected)
          })

          console.log('Device connected successfully')

          // Discover services
          const services = await BleClient.getServices(deviceId)
          console.log('Available services:', services)

          for (const service of services) {
            console.log(`Service: ${service.uuid}`)
            for (const characteristic of service.characteristics) {
              console.log(`Characteristic: ${characteristic.uuid}`)
            }
          }
        } catch (err) {
          console.error('Error connecting to device:', err)
        }
      }

      // Stop scan after 5 seconds
      setTimeout(() => {
        BleClient.stopLEScan()
        if (devices.length === 0) {
          console.log('No devices found')
        }
      }, 5000)
    }
    // Use Web Bluetooth API on web/desktop
    else {
      // Request any Bluetooth device without filtering for a specific service
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information'], // Add the services you want to access
      })

      // Connect to the GATT server
      const server = await device.gatt.connect()

      console.log('Connected to:', device.name)

      // Optionally, you can list all available services on the device
      const services = await server.getPrimaryServices()
      console.log('Available services:', services)

      for (const service of services) {
        console.log(`Service: ${service.uuid}`)

        // Optionally, list characteristics for each service
        const characteristics = await service.getCharacteristics()
        for (const characteristic of characteristics) {
          console.log(`Characteristic: ${characteristic.uuid}`)
        }
      }
    }
  } catch (error) {
    console.error('Error connecting to Bluetooth device:', error)
  }
}

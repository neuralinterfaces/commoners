export async function connect() {
    try {
        // Request any Bluetooth device without filtering for a specific service
        const device = await navigator.bluetooth.requestDevice({ 
            acceptAllDevices: true,
            optionalServices: [ 'battery_service', 'device_information' ] // Add the services you want to access
        });
    
        // Connect to the GATT server
        const server = await device.gatt.connect();
    
        console.log('Connected to:', device.name);
    
        // Optionally, you can list all available services on the device
        const services = await server.getPrimaryServices();
        console.log('Available services:', services);
    
        for (const service of services) {
          console.log(`Service: ${service.uuid}`);
          
          // Optionally, list characteristics for each service
          const characteristics = await service.getCharacteristics();
          for (const characteristic of characteristics) {
            console.log(`Characteristic: ${characteristic.uuid}`);
          }
        }
      } catch (error) {
        console.error('Error connecting to Bluetooth device:', error);
      }
  }
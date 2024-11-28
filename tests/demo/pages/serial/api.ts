export async function connect() {
    try {
      // Request a port and open a connection
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
  
      // Wait for the serial port to be readable
      const reader = port.readable.getReader();
  
      console.log("Connected to serial device")
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log('Serial reading done');
          break;
        }
        // Handle the received data (value is a Uint8Array)
        const data = new TextDecoder().decode(value);
        console.log('Received data:', data);
      }
  
      // Close the reader
      reader.releaseLock();
    } catch (error) {
      console.error('Error connecting to serial port:', error);
    }
  }
  
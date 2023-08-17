// --------- Node Service Test ---------

const url = new URL(globalThis.commoners.services.main.url)

const ws = new WebSocket(`ws://${url.host}`)

const sidecarMessage = document.getElementById('sidecar-msg') as HTMLElement

const onData = (data: any) => {
  if (data.error) return console.error(data.error)

  sidecarMessage.innerText += `${data.command} - ${data.payload}\n`
}

ws.onmessage = (o) => onData(JSON.parse(o.data))

let send = (o: any) => {
  ws.send(JSON.stringify(o))
}

ws.onopen = () => {
  send({ command: 'test', payload: true })
  send({ command: 'platform' })
}

// --------- Python Service Test ---------

const pythonUrl = new URL(globalThis.commoners.services.python.url)

setTimeout(() => {
  fetch(pythonUrl).then(res => res.json()).then(onData)
})



// --------- Web Serial Test ---------
async function requestSerialPort () {

  try {

    const port = await navigator.serial.requestPort({ 
      // filters
    })
    const portInfo = port.getInfo()
    sidecarMessage.innerText += `Connected to Serial Port: vendorId: ${portInfo.usbVendorId} | productId: ${portInfo.usbProductId}\n`
  } catch (e: any) {
    console.error(e)
  }
}

const testSerialConnection = document.getElementById('testSerialConnection')
if (testSerialConnection) testSerialConnection.addEventListener('click', requestSerialPort)

// --------- Web Bluetooth Test ---------
async function requestBluetoothDevice () {

  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true })
  sidecarMessage.innerText +=  `Connected to Bluetooth Device: ${device.name || `ID: ${device.id}`}`
}

const testBluetoothConnection = document.getElementById('testBluetoothConnection')
if (testBluetoothConnection) testBluetoothConnection.addEventListener('click', requestBluetoothDevice)
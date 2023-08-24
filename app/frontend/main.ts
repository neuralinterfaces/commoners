
const sidecarMessage = document.getElementById('sidecar-msg') as HTMLElement

const display = (message: string) => {
  sidecarMessage.innerText += `${message}\n`
}

console.log('Web Serial Supported:', 'serial' in COMMONERS.plugins.loaded)
console.log('Web Bluetooth Supported:', 'bluetooth' in COMMONERS.plugins.loaded)

const onData = (data: any) => {
  if (data.error) return console.error(data.error)
  display(`${data.command} - ${data.payload}`)
}

// Remote API Tests
if (COMMONERS.services.remote && COMMONERS.services.remoteConfig) {
  try {
    const remoteAPI = new URL('/users', COMMONERS.services.remote.url)
    const remoteAPIConfigured = new URL('/users', COMMONERS.services.remoteConfig.url)

    setTimeout(() => {

      fetch(remoteAPI)
      .then(response => response.json())
      .then(json => display(`Remote Response Length: ${json.length}`))


      fetch(remoteAPIConfigured)
      .then(response => response.json())
      .then(json => display(`Remote (Config) Response Length: ${json.length}`))
    })
  } catch (e) {
    console.error('Remote URLs not configured')
  }
} 




// --------- Node Service Test ---------
if (COMMONERS.services.main) {
  const url = new URL(COMMONERS.services.main.url)

  const ws = new WebSocket(`ws://${url.host}`)

  ws.onmessage = (o) => onData(JSON.parse(o.data))

  let send = (o: any) => {
    ws.send(JSON.stringify(o))
  }

  ws.onopen = () => {
    send({ command: 'test', payload: true })
    send({ command: 'platform' })
  }
}

// --------- Python Service Test ---------
if (COMMONERS.services.python) {

  const pythonUrl = new URL(COMMONERS.services.python.url)

  setTimeout(() => fetch(pythonUrl).then(res => res.json()).then(onData))
}



// --------- Web Serial Test ---------
async function requestSerialPort () {

  try {

    const port = await navigator.serial.requestPort({ 
      // filters
    })
    const portInfo = port.getInfo()
    display(`Connected to Serial Port: vendorId: ${portInfo.usbVendorId} | productId: ${portInfo.usbProductId}`)
  } catch (e: any) {
    console.error(e)
  }
}

const testSerialConnection = document.getElementById('testSerialConnection')
if (testSerialConnection) testSerialConnection.addEventListener('click', requestSerialPort)

// --------- Web Bluetooth Test ---------
async function requestBluetoothDevice () {

  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true })
  console.log(device)
  display(`Connected to Bluetooth Device: ${device.name || `ID: ${device.id}`}`)
}

const testBluetoothConnection = document.getElementById('testBluetoothConnection')
if (testBluetoothConnection) testBluetoothConnection.addEventListener('click', requestBluetoothDevice)
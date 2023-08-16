const url = new URL(globalThis.commoners.services.main.url)

const pythonUrl = new URL(globalThis.commoners.services.python.url)

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

setTimeout(() => {
  fetch(pythonUrl).then(res => res.json()).then(onData)
})



// Test Web Serial
async function requestSerialPort () {

  try {

    const port = await navigator.serial.requestPort({ 
      // filters
    })
    const portInfo = port.getInfo()
    sidecarMessage.innerText += `vendorId: ${portInfo.usbVendorId} | productId: ${portInfo.usbProductId}\n`
  } catch (e: any) {
    console.error(e)
    if (e.name === 'NotFoundError') {
      sidecarMessage.innerText += 'Device NOT found'
    } else {
      sidecarMessage.innerText +=  e
    }
  }
}

const testSerialConnection = document.getElementById('testSerialConnection')
if (testSerialConnection) testSerialConnection.addEventListener('click', requestSerialPort)
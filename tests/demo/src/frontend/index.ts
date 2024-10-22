import { NAME, ICON, SERVICES, READY, DESKTOP } from 'commoners:env'

import './style.css'

import * as bleAPI from './bluetooth'
import * as serialAPI from './serial'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <img src="${ICON}" class="logo" alt="My app logo" />
    <h1>${NAME}</h1>
    <div id="outputs">
    </div>
    <div class="card">
      <button id="requests" type="button">Send Requests</button>
      <button id="popup" type="button">Open Popup</button>
      <button id="duplicate" type="button">Open Duplicate Window</button>
      <button id="ble" type="button">Connect to BLE Device</button>
      <button id="serial" type="button">Connect to Serial Device</button>

    </div>
  </div>
`

const requestButton = document.getElementById('requests')!
const popupButton = document.getElementById('popup')!
const duplicateButton = document.getElementById('duplicate')!
const serialButton = document.getElementById('serial')!
const bleButton = document.getElementById('ble')!

const outputs = document.getElementById('outputs')!


// ---------------------- Serial Button ----------------------
READY.then((PLUGINS) => {
  const hasSerial = "serial" in PLUGINS
  if (!hasSerial) return serialButton.disabled = true
  serialButton.onclick = () => {
    serialAPI.connect()
  }
})

// ---------------------- Bluetooth Button ----------------------
READY.then((PLUGINS) => {
  const hasBluetooth = "bluetooth" in PLUGINS
  if (!hasBluetooth) return bleButton.disabled = true
  bleButton.onclick = () => {
    bleAPI.connect()
  }
})

// ---------------------- Window Buttons ----------------------

const onWindowReady = (win) => {
  win.addEventListener("message", async (ev) => {
    const { command, payload } = ev.detail;
    if (command === "pong") return console.log('Pong', payload)
    if (command === 'ping') return win.send("pong", { request: payload, response: performance.now() })
    console.log('Other Message', command, payload)
  });

  win.addEventListener("closed", async () => console.warn('Window was closed'));

  win.send("ping", performance.now())
}

const openWindow = async (type, windows) => {
  const window = windows[type].create()
  window.addEventListener("ready", () => onWindowReady(window))
  await window.open()
}

READY.then(({ windows }) => {
  if (!windows || !DESKTOP.__main) {
    popupButton.disabled = true
    duplicateButton.disabled = true
    return
  }

  Object.values(windows).forEach(windowType => Object.values(windowType.windows).forEach(win => onWindowReady(win))) // Handle existing windows

  popupButton.onclick = () => openWindow('popup', windows)
  duplicateButton.onclick = () => openWindow('main', windows)

})

// ---------------------- Service Button ----------------------

const keys = Object.keys(SERVICES)
const values = Object.values(SERVICES)

if (values.length === 0) {
  requestButton.disabled = true
  outputs.innerHTML = '<p>No services available</p>'
}

else {

  requestButton.onclick = async () => {
    const responses = await Promise.allSettled(values.map(({ url }) => fetch(url).then(response => response.text())))
    outputs.innerHTML = responses.map((p, i) => {
      const name = keys[i]
      if (p.status === 'fulfilled')return `<p><b>${name}:</b> ${p.value}</p>`
      else return `<p style="color: red;"><b>${name}:</b> ${p.reason}</p>`
    }).join('')
  }

}
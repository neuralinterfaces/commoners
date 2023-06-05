// import { BrowserWindow, IpcMain, IpcMainEvent, IpcRenderer, IpcRendererEvent } from "electron";

export const name = 'bluetooth'

export const capacitorName = 'BluetoothLe'

export function main (
  // this: IpcMain, 
  win//: BrowserWindow
) {

    // Enable Web Bluetooth
    let selectBluetoothCallback;

    this.on("bluetooth.selectDevice", (
      _evt, //: IpcMainEvent, 
      value //: string
    ) => {
        console.log('selecting', value)
        if (typeof selectBluetoothCallback === 'function') selectBluetoothCallback(value)
        else selectBluetoothCallback = null
    });

    // NOTE: For handling additional permissions that rarely crop up. Automatically confirm
    win.webContents.session.setBluetoothPairingHandler((details, callback) => {
      if (details.pairingKind === 'confirm') callback({ confirmed: true })
      else console.error(`COMMONERS Bluetooth Extension does not support devices that need ${details.pairingKind} permissions.`)
    })

    win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
      event.preventDefault()
      win.webContents.send("bluetooth.requestDevice", devices);
      selectBluetoothCallback = callback
    })

}

export function preload(
  // this: IpcRenderer
) {
    return {
        onRequestDevice: (
          callback//: (evt: IpcRendererEvent) => void
        ) => this.on("bluetooth.requestDevice", (sender, value) => {
          callback(sender.senderId, value)
        }),
        selectDevice: (
          deviceID //: string
        ) => this.send("bluetooth.selectDevice", deviceID),
    }
}

export function renderer(
  // this: any
) {

  const dialog = document.createElement('dialog')
  dialog.addEventListener('click', () => dialog.close());


  const container = document.createElement('section')
  container.addEventListener('click', (event) => event.stopPropagation());
  dialog.append(container)

  const header = document.createElement('header')
  header.style.paddingBottom = '20px'

  const footer = document.createElement('footer')
  footer.style.paddingTop = '20px'

  const main = document.createElement('div')
  main.style.overflow = 'auto'
  main.style.maxHeight = '300px'

  const title = document.createElement('h3')
  title.innerText = `Available BLE Devices`
  header.append(title)

  const ul = document.createElement('ul')
  main.append(ul)

  const form = document.createElement('form')
  form.method = 'dialog'

  const cancelButton = document.createElement('button')
  cancelButton.innerText = 'Cancel'

  let selectedDevice = ''
  const pairButton = document.createElement('button')
  pairButton.innerText = 'Pair'
  pairButton.addEventListener('click', () => {
    dialog.close(selectedDevice)
  })

  
  form.append(cancelButton, pairButton)
  footer.append(form)

  container.append(header, main, footer)

  dialog.addEventListener('close', () => {
    this.bluetooth.selectDevice(dialog.returnValue ?? '')
  })

  document.body.append(dialog)

  let latestDevices = ''

  this.bluetooth.onRequestDevice((id, devices) => {

      // Update the devices list if different
      if (latestDevices !== JSON.stringify(devices)) {
                
        latestDevices = JSON.stringify(devices)

        if (!dialog.open) {
          ul.innerText = ''
          selectedDevice = ''
          pairButton.setAttribute('disabled', '')
          dialog.showModal()
        }

        const filtered = devices.filter(o => !dialog.querySelector(`[data-id="${o.deviceId}"]`))

        ul.append(...filtered.map(({ deviceName, deviceId }) => {
          const li = document.createElement('li')
          li.style.cursor = 'pointer'
          li.innerText = deviceName
          li.setAttribute('data-id', deviceId)
          li.onclick = () => {
            pairButton.removeAttribute('disabled')
            selectedDevice = deviceId
          }
          return li
        }))
      }

  })
}
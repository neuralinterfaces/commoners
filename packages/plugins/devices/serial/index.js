export const name = 'serial'

export function main(
  // this: IpcMain, 
  win//: BrowserWindow
) {

  let selectPortCallback;

  win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    // Add listeners to handle ports being added or removed before the callback for `select-serial-port` is called.
    win.webContents.session.on('serial-port-added', (event, port) => {
      win.webContents.send("serial.added", port);
    })

    win.webContents.session.on('serial-port-removed', (event, port) => {
      win.webContents.send("serial.removed", port);
    })

    win.webContents.send("serial.request", portList);

    event.preventDefault()
    selectPortCallback = callback

    // NOTE: Ensure this is only called once
    this.on("serial.select", (
      _evt, //: IpcMainEvent, 
      port //: string
    ) => {
      if (typeof selectPortCallback === 'function') selectPortCallback(port)
      else selectPortCallback = null
    });

  })

  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => true)
  win.webContents.session.setDevicePermissionHandler((details) => true)
}

export function preload(
  // this: IpcRenderer
) {

  this.on("serial.added", (port) => console.log('Port added', port))
  this.on("serial.removed", (port) => console.log('Port removed', port))

  return {
    select: (port) => this.send("serial.select", port),
    onRequest: (callback) => this.on("serial.request", (sender, value) => callback(sender.senderId, value)),
  }
}

export function renderer() {

  // -----------------------------------------------------------------------------------------
// ------------------------------ COMMON BETWEEN DEVICE TYPES ------------------------------
// -----------------------------------------------------------------------------------------

const generateModal = ({ 
  headerText = 'Available Devices', 
  mapDeviceToInfo,
  onClose, 
  onRequest 
}) => {

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
  title.innerText = headerText
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
    onClose(dialog.returnValue ?? '')
  })

  let latestDevices = ''

  onRequest((id, devices) => {

    // Update the devices list if different
    if (latestDevices !== JSON.stringify(devices)) {

      latestDevices = JSON.stringify(devices)

      if (!dialog.open) {
        ul.innerText = ''
        selectedDevice = ''
        pairButton.setAttribute('disabled', '')
        dialog.showModal()
      }

      const mapped = devices.map(mapDeviceToInfo)

      const filtered = mapped.filter(o => !dialog.querySelector(`[data-id="${o.id}"]`))

      ul.append(...filtered.map(({ name, id }) => {
        const li = document.createElement('li')
        li.style.cursor = 'pointer'
        li.innerText = name
        li.setAttribute('data-id', id)
        li.onclick = () => {
          pairButton.removeAttribute('disabled')
          selectedDevice = id
        }
        return li
      }))
    }

  })

  return dialog
}

// -----------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------


  const modal = generateModal({
    headerText: `Available Serial Ports`,
    mapDeviceToInfo: (o) => {
      return {
        name: o.portName,
        id: o.portId
      }
    },
    onRequest: this.serial.onRequest,
    onClose: (port) => this.serial.select(port)
  })

  document.body.append(modal)

}
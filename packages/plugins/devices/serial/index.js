import { generateModal } from '../common.js'

export const name = 'serial'

export const isSupported = {
  desktop: true,
  mobile: false,
  web: async () => 'serial' in navigator 
}

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
      selectPortCallback = null
    });

  })

  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => true)
  win.webContents.session.setDevicePermissionHandler((details) => true)
}

export function preload(
  // this: IpcRenderer
) {

  return {
    added: (callback) => this.on("serial.added", (_, port) => callback(port)),
    removed: (callback) => this.on("serial.removed", (_, port) => callback(port)),
    select: (port) => this.send("serial.select", port),
    onRequest: (callback) => this.on("serial.request", (_, value) => callback(value)),
  }
}

export function render({ onRequest, added, removed, select }) {

  const modal = generateModal({
    headerText: `Available Serial Ports`,
    added,
    removed,
    mapDeviceToInfo: (o) => {
      return {
        name: o.displayName ?? o.portName,
        info: o.displayName ? o.portName : '',
        id: o.portId
      }
    },
    onClose: (port) => select(port)
  })

  onRequest((devices) => {
    modal.update(devices)
    modal.showModal()
  }) // Open on each request

  document.body.append(modal)

  return { modal } 

}
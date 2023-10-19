import createModal from '../modal.js';

export const name = 'serial'

export const isSupported = {
  desktop: true,
  mobile: () => {
    return COMMONERS.TARGET === 'android'
  },
  web: {
    check: async () => 'serial' in navigator, 
    load: false
  }
}

export function loadDesktop( win ) {

  let selectPortCallback;

  win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    // Add listeners to handle ports being added or removed before the callback for `select-serial-port` is called.
    win.webContents.session.on('serial-port-added', (event, port) => {
      win.webContents.send(`${name}.added`, port);
    })

    win.webContents.session.on('serial-port-removed', (event, port) => {
      win.webContents.send(`${name}.removed`, port);
    })

    win.webContents.send(`${name}.request`, portList);

    event.preventDefault()
    selectPortCallback = callback

    // NOTE: Ensure this is only called once
    this.on(`${name}.select`, (
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

export function load() {

  const added = (callback) => this.on(`${name}.added`, (_, port) => callback(port))
  const removed = (callback) => this.on(`${name}.removed`, (_, port) => callback(port))
  const select = (port) => this.send(`${name}.select`, port)
  const onRequest =(callback) => this.on(`${name}.request`, (_, value) => callback(value))


  const modal = createModal({
    headerText: 'Available Serial Ports',
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

  return {
    modal,

    added, 
    removed,
    select,
    onRequest
  }

}
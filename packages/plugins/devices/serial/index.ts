import createModal from '../modal.js';

export const isSupported = {
  desktop: true,
  mobile: () => {
    return commoners.target === 'android'
  },
  web: {
    check: async () => 'serial' in navigator,
    load: false
  }
}

export const desktop = {
  ready: function () {
      this.CALLBACKS = {}
  },
  load: function ( win ) {

    const id = win.__id
  
    win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {

      // Add listeners to handle ports being added or removed before the callback for `select-serial-port` is called.
      win.webContents.session.on('serial-port-added', (event, port) =>  this.send(`${id}:added`, port))
  
      win.webContents.session.on('serial-port-removed', (event, port) => this.send(`${id}:removed`, port))
  
      this.send(`${id}:request`, portList);
      this.on(`${id}:select`, (_evt, port) =>  this.CALLBACKS[id]?.(port));

      event.preventDefault()
      this.CALLBACKS[id] = (port) => {
        this.CALLBACKS[id] = null // Ensures this is only called once
        callback(port)
      }

    })
  
    win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => true)
    win.webContents.session.setDevicePermissionHandler((details) => true)
  }
}

export function load() {

  const { __id } = commoners.DESKTOP
  
  const added = (callback) => this.on(`${__id}:added`, (_, port) => callback(port))
  const removed = (callback) => this.on(`${__id}:removed`, (_, port) => callback(port))
  const select = (port) => this.send(`${__id}:select`, port)
  const onRequest =(callback) => this.on(`${__id}:request`, (_, value) => callback(value))

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
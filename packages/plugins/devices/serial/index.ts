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

    const { __id } = win
    const { session } = win.webContents
  

    this.on(`${__id}:select`, (_, port) =>  this.CALLBACKS[__id]?.(port));
    session.on('serial-port-added', (_, port) =>  this.send(`${__id}:added`, port))
    session.on('serial-port-removed', (_, port) => this.send(`${__id}:removed`, port))

    session.on('select-serial-port', (event, portList, webContents, callback) => {

      const window = this.electron.BrowserWindow.fromWebContents(webContents);
      if (__id !== window.__id) return // Skip if the attached window did not trigger the request


      this.send(`${__id}:request`, portList);

      event.preventDefault()
      this.CALLBACKS[__id] = (port) => {
        this.CALLBACKS[__id] = null // Ensures this is only called once
        callback(port)
      }

    })
  
    session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => true)
    session.setDevicePermissionHandler((details) => true)
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
import createModal from '../modal.js'

// Android USB serial support via Capacitor
// NOTE: iOS serial is not supported due to Apple MFi program restrictions.
// Apple requires MFi certification for serial/USB accessory communication,
// which is not available through standard Capacitor plugins.
const capacitorConfiguration = {
  name: 'UsbSerial',
  manifest: {
    'uses-feature': [{ 'android:name': 'android.hardware.usb.host', 'android:required': 'false' }],
    'uses-permission': [{ 'android:name': 'android.permission.USB_PERMISSION' }],
  },
}

export const capabilities = {
  provides: ['serial', 'device-access'],
  platforms: { web: true, desktop: true, mobile: 'android' as const },
  runtime: 'browser' as const,
}

export const isSupported = {
  capacitor: capacitorConfiguration,
  load: ({ WEB, MOBILE }) => {
    if (WEB) return 'serial' in navigator // Ensure serial feature is available
    if (MOBILE) return MOBILE === 'android' // iOS serial not supported (MFi restriction)
  },
}

export const ready = function () {
  this.CALLBACKS = {}
}

export const desktop = {
  load: function (win) {
    const { __id } = win
    const { session } = win.webContents

    this.on(`${__id}:select`, (_, port) => this.CALLBACKS[__id]?.(port))
    session.on('serial-port-added', (_, port) => this.send(`${__id}:added`, port))
    session.on('serial-port-removed', (_, port) => this.send(`${__id}:removed`, port))

    session.on('select-serial-port', (event, portList, webContents, callback) => {
      const window = this.electron.BrowserWindow.fromWebContents(webContents)
      if (__id !== window.__id) return // Skip if the attached window did not trigger the request

      this.send(`${__id}:request`, portList)

      event.preventDefault()
      this.CALLBACKS[__id] = port => {
        this.CALLBACKS[__id] = null // Ensures this is only called once
        callback(port)
      }
    })

    session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => true)
    session.setDevicePermissionHandler(details => true)
  },
}

export function load() {
  const { DESKTOP } = commoners

  if (!DESKTOP) return

  const { __id } = DESKTOP

  const callbacks: Record<string, Function[]> = {}

  const runCallbacks = (type, ...args) => {
    const fullId = `${__id}:${type}`
    if (!callbacks[fullId]) return
    callbacks[fullId].forEach(callback => callback(...args))
  }

  this.on(`${__id}:added`, (_, port) => runCallbacks('added', port))
  this.on(`${__id}:removed`, (_, port) => runCallbacks('removed', port))
  this.on(`${__id}:request`, (_, value) => runCallbacks('request', value))

  const addCallback = (type, callback) => {
    const fullId = `${__id}:${type}`
    if (!callbacks[fullId]) callbacks[fullId] = []
    callbacks[fullId].push(callback)
  }

  const added = callback => addCallback('added', callback)
  const removed = callback => addCallback('removed', callback)
  const select = port => this.send(`${__id}:select`, port)
  const onRequest = callback => addCallback('request', callback)

  const modal = createModal({
    headerText: 'Available Serial Ports',
    added,
    removed,
    mapDeviceToInfo: o => {
      return {
        name: o.displayName ?? o.portName,
        info: o.displayName ? o.portName : '',
        id: o.portId,
      }
    },
    onClose: port => select(port),
  })

  onRequest(devices => {
    modal.update(devices)
    modal.showModal()
  }) // Open on each request

  document.body.append(modal)

  return {
    modal,

    added,
    removed,
    select,
    onRequest,
  }
}

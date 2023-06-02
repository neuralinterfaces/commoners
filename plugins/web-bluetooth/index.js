// import { BrowserWindow, IpcMain, IpcMainEvent, IpcRenderer, IpcRendererEvent } from "electron";

export const name = 'bluetooth'

export const capacitorName = 'BluetoothLe'

export function main (
  // this: IpcMain, 
  win//: BrowserWindow
) {

    // Enable Web Bluetooth
    let active = false
    win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
      event.preventDefault()
      win.webContents.send("bluetooth.requestDevice", devices);
  
      if (!active) {
        console.log(`Requesting a Bluetooth device...`);
        this.on("bluetooth.selectDevice", (
          _evt, //: IpcMainEvent, 
          value //: string
        ) => {
          if (active) {
            console.log(`Bluetooth device '(${value})' selected.`);
            active = false
            callback(value)
          }
        });
  
        active = true
      }
    })

}

export function preload(
  // this: IpcRenderer
) {
    return {
        onRequestDevice: (
          callback//: (evt: IpcRendererEvent) => void
        ) => this.on("bluetooth.requestDevice", (_, value) => callback(value)),
        selectDevice: (
          // deviceID: string
        ) => this.send("bluetooth.selectDevice", deviceID),
    }
}

export function renderer(
  // this: any
) {
    this.bluetooth.onRequestDevice(((devices) => {
        const device = devices.find(o => o.deviceName === 'HEG')
        if (device) this.bluetooth.selectDevice(device.deviceId)
    }))
}
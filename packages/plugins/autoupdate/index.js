import electronUpdater from 'electron-updater';


export const name = 'autoupdate'

export function main (
  // this: IpcMain, 
  win, //: BrowserWindow
  globals
) {

    const { autoUpdater } = electronUpdater
    
    autoUpdater.channel = "latest";

    autoUpdater.on("update-available", () => win.webContents.send("autoupdate.available"));
    autoUpdater.on("update-downloaded", () => win.webContents.send("autoupdate.downloaded"));
    this.on("autoupdate.restart", () => autoUpdater.quitAndInstall());

    win.webContents.once("dom-ready", () => {
        if (globals.updateChecked == false) autoUpdater.checkForUpdatesAndNotify()
    });

    win.once("ready-to-show", () => {
        autoUpdater.checkForUpdatesAndNotify();
        globals.updateChecked  = true;
    });
}

export function preload(
  // this: IpcRenderer
) {

    return {
        onAvailable: () => this.on("autoupdate.available", () => {
            this.removeAllListeners("autoupdate.available");
            console.warn("A new update is available. Downloading now...")
        }),

        onDownloaded: () => this.on("autoupdate.downloaded", async () => {
            this.removeAllListeners("autoupdate.downloaded");
            console.warn("Update downloaded. It will be installed when you close and relaunch the app.")
            // this.send("restart-to-update");
          })
    }
}
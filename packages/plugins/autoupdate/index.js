import electronUpdater from 'electron-updater';

// NOTE: Ensure persistence of custom properties set on the function context

  export function load(
    // this: IpcRenderer
  ) {
  
      return {
          onAvailable: () => this.on(`available`, () => {
              this.removeAllListeners(`available`);
              console.warn("A new update is available. Downloading now...")
          }),
  
          onDownloaded: () => this.on(`downloaded`, async () => {
              this.removeAllListeners(`downloaded`);
              console.warn("Update downloaded. It will be installed when you close and relaunch the app.")
              // this.send("restart-to-update");
            })
      }
  }

export const desktop = {
    load: function main (
        // this: IpcMain, 
        win, //: BrowserWindow
      ) {
      
          const { autoUpdater } = electronUpdater
          
          autoUpdater.channel = "latest";
      
          autoUpdater.on("update-available", () => this.send(`available`));
          autoUpdater.on("update-downloaded", () => this.send(`downloaded`));
          this.on(`restart`, () => autoUpdater.quitAndInstall());
      
          win.webContents.once("dom-ready", () => {
              if (this.updateChecked == false) autoUpdater.checkForUpdatesAndNotify()
          });
      
          win.once("ready-to-show", () => {
              autoUpdater.checkForUpdatesAndNotify();
              this.updateChecked  = true;
          });
      }
}
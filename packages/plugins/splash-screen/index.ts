const DEFAULT_OPTIONS = {
    width: 340,
    height: 340,
    frame: false,
    alwaysOnTop: true,
    transparent: true
}

type SplashScreenOption = {
    minimumDisplayTime?: number,
    window?: Electron.BrowserWindowConstructorOptions,
    waitUntil?: string[]
    
}


export default (page: string, options: SplashScreenOption = {}) => {
    return {
      assets: { page },
      desktop: {
        load: async function (loadingWindow, pluginId) {
          
            if (!loadingWindow.__main || !loadingWindow.__show) return // Only run when the main window has been spawned and will show soon

            const { 
                minimumDisplayTime, // This defines a minimum wait time
                window = {} ,
                waitUntil
            } =  options

            const firstLoad = !this.LOADED

            if (!firstLoad) return
            this.LOADED = true
            loadingWindow.__show = false

            const { assets } = this.plugin;

            // Create the splash window
            const win = await this.createWindow(assets.page,  Object.assign(DEFAULT_OPTIONS, window))

            const start = performance.now()

            const promiseToAwait = waitUntil ? Promise.all(Object.keys(win.__loading).map(id => waitUntil.includes(id) && id !== pluginId && win.__loading[id])).then(() => {}) : loadingWindow.__ready
            await promiseToAwait
              
            const show = () => {
                win.close()
                loadingWindow.__show = true // Respect locks applied from other plugins
                loadingWindow.show()
            }

            if (minimumDisplayTime) setTimeout(show, minimumDisplayTime - (performance.now() - start)); // Show for duration left
            else show()

        },
      },
    };
  };
  
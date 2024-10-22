const DEFAULT_OPTIONS = {
    width: 340,
    height: 340,
    frame: false,
    alwaysOnTop: true,
    transparent: true
}

type SplashScreenOption = {
    duration?: number,
    window?: Electron.BrowserWindowConstructorOptions
}


export default (page: string, options: SplashScreenOption = {}) => {
    return {
      isSupported: {
        web: false,
        mobile: false
      },
      assets: {
        page: { src: page },
      },
      desktop: {
        load: async function (loadingWindow) {

            if (!loadingWindow.__main || !loadingWindow.__show) return // Only run when the main window has been spawned and will show soon

            const { 
                duration = 1000, // This defines a minimum wait time
                window = {} 
            } =  options

            const firstLoad = !this.LOADED
            console.log('PASSED!')

            if (!firstLoad) return
            this.LOADED = true
            loadingWindow.__show = false

            const { assets } = this.plugin;

            console.log('GO!')
            const win = await this.createWindow(assets.page,  Object.assign(DEFAULT_OPTIONS, window))

            const start = performance.now()
            loadingWindow.once('ready-to-show', () => {
                const now = performance.now()
                const elapsed = now - start
                const durationLeft = duration ? duration - elapsed : 0  // Wait for rest of time if duration is specified
                setTimeout(() => {
                    win.close()
                    delete loadingWindow.__show
                    loadingWindow.show()
                }, durationLeft);
            })

        },
      },
    };
  };
  
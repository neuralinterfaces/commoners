type TestOptions = {
    remoteDebuggingPort?: number
    remoteAllowOrigins?: string 
}

export default (options: TestOptions) => {

    const { 
        remoteDebuggingPort = 8315, 
        remoteAllowOrigins = '*'   // Allow all remote origins
    } = options


    return {

        // Store options for future reference
        options,

        // Check if supported
        isSupported: {
            web: false,
            mobile: false
        },

        desktop: {
            start: function() {
                const { process } = globalThis
                const { COMMONERS_TESTING } = process.env
                if (!COMMONERS_TESTING) return
                if (remoteDebuggingPort) this.electron.app.commandLine.appendSwitch("remote-debugging-port", `${remoteDebuggingPort}`)
                if (remoteAllowOrigins) this.electron.app.commandLine.appendSwitch("remote-allow-origins", `${remoteAllowOrigins}`)
            },
            load: function (win) {
                const { process } = globalThis
                const { COMMONERS_TESTING } = process.env
                if (!COMMONERS_TESTING) return
                win.__show = null // Do not show windows while testing
            }
        }
    }
}
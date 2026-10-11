type TestOptions = {
  remoteDebuggingPort?: number
  remoteAllowOrigins?: string
}

export default (options: TestOptions) => {
  const {
    remoteDebuggingPort = 8315,
    remoteAllowOrigins = '*', // Allow all remote origins
  } = options

  return {
    isSupported: ({ DESKTOP }) => DESKTOP,

    // Store options for future reference
    options,

    // NOTE: Remote debugging port is configured via spawn CLI args in electron.ts startup(),
    // which runs BEFORE the Electron main process. commandLine.appendSwitch here runs too
    // late — Chromium reads --remote-debugging-port during native init, before JS executes.
    // This plugin's primary role is to provide the remoteDebuggingPort option for the
    // testing package to read (see index.ts:open()).
    start: function () {
      const { process } = globalThis // Required for process resolution
      const { __COMMONERS_TESTING } = process.env
      if (!__COMMONERS_TESTING) return
      // appendSwitch is a best-effort fallback — the real CDP config happens in electron.ts spawn args
      if (remoteDebuggingPort)
        this.electron.app.commandLine.appendSwitch(
          'remote-debugging-port',
          `${remoteDebuggingPort}`
        )
      if (remoteAllowOrigins)
        this.electron.app.commandLine.appendSwitch('remote-allow-origins', `${remoteAllowOrigins}`)
    },

    desktop: {
      load: function (win) {
        const { process } = globalThis // Required for process resolution
        const { __COMMONERS_TESTING } = process.env
        if (!__COMMONERS_TESTING) return
        win.__show = null // Do not show windows while testing
      },
    },
  }
}

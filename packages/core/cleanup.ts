const callbacks = []
export const onCleanup = (callback) => callbacks.push(callback)

export const cleanup = async (code = 0) => {
    for (const cb of callbacks) {
        if (!cb.called) {
            cb.called = true // Prevent double-calling
            await cb(code)
        }
    }
}

export const exit = async (code) => {
    try { await cleanup(code) } catch (e) { console.error(e) }
    if (!globalThis.process.env.__COMMONERS_TESTING) process.exit(code === 'SIGINT' ? 0 : code) // Do not force exit if testing
}

const exitEvents = ['beforeExit', 'exit', 'SIGINT']
exitEvents.forEach(event => process.on(event, exit))

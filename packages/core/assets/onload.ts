import { asyncFilter, isPluginSupported, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const TEMP_COMMONERS = globalThis.__commoners ?? {}

// Set global variable
const ENV = commoners
const { __PLUGINS, DESKTOP, MOBILE, __READY } = ENV
delete ENV.__PLUGINS

const TARGET = DESKTOP ? 'desktop' : MOBILE ? 'mobile' : 'web'

if ( __PLUGINS ) {

    const loaded = {}

    asyncFilter(Object.entries(__PLUGINS), async ([ id, plugin ]) => {
        try {
            return await isPluginSupported(plugin, TARGET)
        } catch (e) {
            return false
        }
    }).then(supported => {

    const sanitized = supported.map(([id , o]) => {
        const { load } = sanitizePluginProperties(o, TARGET)
        return { id, load }
    })

    sanitized.forEach(async ({ id, load }) => {
        
        loaded[id] = undefined // Register that all supported plugins are technically loaded

        try {

            if (load) {
                const ctx = DESKTOP ? {
                    ...DESKTOP,
                    send: (channel, ...args) => TEMP_COMMONERS.send(`plugins:${id}:${channel}`, ...args),
                    sendSync: (channel, ...args) => TEMP_COMMONERS.sendSync(`plugins:${id}:${channel}`, ...args),
                    on: (channel, listener) => TEMP_COMMONERS.on(`plugins:${id}:${channel}`, listener),
                    once: (channel, listener) => TEMP_COMMONERS.once(`plugins:${id}:${channel}`, listener),
                    removeAllListeners: (channel) => TEMP_COMMONERS.removeAllListeners(`plugins:${id}:${channel}`)
                } : {}

                loaded[id] = load.call(ctx, ENV)
                await loaded[id]
                if (DESKTOP) TEMP_COMMONERS.send(["commoners:loaded", DESKTOP.__id, id].join(":")) // Notify the main process that the plugin is loaded
            }

        } catch (e) {
            pluginErrorMessage(id, "load", e)
        }
    })

    ENV.PLUGINS = loaded
    __READY(loaded)
})

} else {
    __READY({})
}
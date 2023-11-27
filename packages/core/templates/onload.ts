import { asyncFilter, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const TEMP_COMMONERS = globalThis.__commoners ?? {}
const { __plugins, target, __ready } = commoners
delete commoners.__plugins

if ( __plugins ) {

    const loaded = {}

    asyncFilter(Object.entries(__plugins), async ([id, plugin]) => {
        try {
            let { isSupported } = plugin
            if (isSupported && typeof isSupported === 'object') isSupported = isSupported[target]
            if (typeof isSupported?.check === 'function') isSupported = isSupported.check
            return (typeof isSupported === 'function') ? await isSupported.call(plugin, target) : isSupported !== false
        } catch {
            return false
        }
    }).then(supported => {

    const sanitized = supported.map(([id , o]) => {
        const { load } = sanitizePluginProperties(o, target)
        return { id, load }
    })

    sanitized.forEach(({ id, load }) => {
        
        loaded[id] = undefined // Register that all supported plugins are technically loaded

        try {
            if (load) {
                loaded[id] = commoners.target === 'desktop' ? load.call({
                    quit: TEMP_COMMONERS.quit,
                    send: (channel, ...args) => TEMP_COMMONERS.send(`plugins:${id}:${channel}`, ...args),
                    sendSync: (channel, ...args) => TEMP_COMMONERS.sendSync(`plugins:${id}:${channel}`, ...args),
                    on: (channel, listener) => TEMP_COMMONERS.on(`plugins:${id}:${channel}`, listener),
                    removeAllListeners: (channel) => TEMP_COMMONERS.removeAllListeners(`plugins:${id}:${channel}`),
                }) : load({})
            }
        } catch (e) {
            pluginErrorMessage(id, "load", e)
        }

    })

    commoners.plugins = loaded
    __ready(loaded)
})

} else __ready({})
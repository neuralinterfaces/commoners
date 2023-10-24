import { asyncFilter, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const { ipcRenderer } = globalThis.__COMMONERS ?? {}
const { __plugins, TARGET, __ready } = COMMONERS
delete COMMONERS.__plugins

if ( __plugins ) {

    const loaded = {}

    asyncFilter(__plugins, async (plugin) => {
        try {
            let { isSupported } = plugin
            if (isSupported && typeof isSupported === 'object') isSupported = isSupported[TARGET]
            if (typeof isSupported?.check === 'function') isSupported = isSupported.check
            return (typeof isSupported === 'function') ? await isSupported.call(plugin, TARGET) : isSupported !== false
        } catch {
            return false
        }
    }).then(supported => {

    const sanitized = supported.map((o) => sanitizePluginProperties(o, TARGET))

    sanitized.forEach(({ name, load }) => {
        
        loaded[name] = undefined // Register that all supported plugins are technically loaded

        try {
            if (load) loaded[name] = ipcRenderer ? load.call(ipcRenderer) : load()
        } catch (e) {
            pluginErrorMessage(name, "load", e)
        }

    })

    COMMONERS.plugins = loaded
    __ready(loaded)
})

} else __ready({})
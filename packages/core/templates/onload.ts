import { asyncFilter, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const { ipcRenderer } = globalThis.__commoners ?? {}
const { __plugins, target, __ready } = commoners
delete commoners.__plugins

if ( __plugins ) {

    const loaded = {}

    asyncFilter(__plugins, async (plugin) => {
        try {
            let { isSupported } = plugin
            if (isSupported && typeof isSupported === 'object') isSupported = isSupported[target]
            if (typeof isSupported?.check === 'function') isSupported = isSupported.check
            return (typeof isSupported === 'function') ? await isSupported.call(plugin, target) : isSupported !== false
        } catch {
            return false
        }
    }).then(supported => {

    const sanitized = supported.map((o) => sanitizePluginProperties(o, target))

    sanitized.forEach(({ name, load }) => {
        
        loaded[name] = undefined // Register that all supported plugins are technically loaded

        try {
            if (load) loaded[name] = ipcRenderer ? load.call(ipcRenderer) : load()
        } catch (e) {
            pluginErrorMessage(name, "load", e)
        }

    })

    commoners.plugins = loaded
    __ready(loaded)
})

} else __ready({})
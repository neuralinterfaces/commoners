import { asyncFilter, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const { ipcRenderer } = globalThis.__COMMONERS ?? {}
const { __plugins } = COMMONERS
delete COMMONERS.__plugins


let target = COMMONERS.TARGET

const desktopTargets = ['desktop', 'mac', 'windows', 'linux']
const mobileTargets = ['mobile', 'android', 'ios']

if (desktopTargets.includes(target)) target = 'desktop';
else if (mobileTargets.includes(target)) target = 'mobile';
else target = 'web' 

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

    COMMONERS.plugins = loaded
    COMMONERS.__ready(loaded)
})

} else COMMONERS.__ready({})
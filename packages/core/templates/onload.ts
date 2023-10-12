import { asyncFilter, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const { ipcRenderer } = globalThis.__COMMONERS ?? {}
const { __plugins } = COMMONERS
delete COMMONERS.__plugins

if ( __plugins ) {

    const loaded = {}
    const __toRender = {}

    asyncFilter(__plugins, async (plugin) => {
        try {
            let { isSupported } = plugin
            if (isSupported && typeof isSupported === 'object') isSupported = isSupported[COMMONERS.TARGET]
            if (typeof isSupported?.check === 'function') isSupported = isSupported.check
            return (typeof isSupported === 'function') ? await isSupported.call(plugin, COMMONERS.TARGET) : isSupported !== false
        } catch {
            return false
        }
    }).then(supported => {

    const sanitized = supported.map((o) => sanitizePluginProperties(o, COMMONERS.TARGET))

    sanitized.forEach(({ name, preload }) => {
        
        loaded[name] = undefined // Register that all supported plugins are technically loaded

        try {
            if (preload) loaded[name] = ipcRenderer ? preload.call(ipcRenderer) : preload()
        } catch (e) {
            pluginErrorMessage(name, "preload", e)
        }

    })

    sanitized.forEach(({ name, render }) => {
        if (render) __toRender[name] = render
    })

    COMMONERS.plugins = { loaded, __toRender }
    COMMONERS.__ready(loaded)
})

} else COMMONERS.__ready({})



const onDOMReady = (callback) => {
    if (document.readyState === "complete"  || document.readyState === "loaded" || document.readyState === "interactive") callback()
    else document.addEventListener("DOMContentLoaded", callback)
}

onDOMReady(async function(){

    await COMMONERS.ready

    const { plugins } = COMMONERS
    
    // Handle Preloaded Plugin Values
    const { __toRender = {}, loaded = {} } = plugins
    delete plugins.__toRender
    
    const rendered = plugins.rendered = {}
    for (let name in __toRender) {
        try {
            rendered[name] = __toRender[name](loaded[name])
        } catch (e) {
            pluginErrorMessage(name, "render", e)
        }
    }
});
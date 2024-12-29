
const isDesktop = (target) => target === 'desktop' || target === 'electron' // Duplicated from globals.ts

// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
export const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));


// Injected environment from the Commoners build process
export const pluginErrorMessage = (name, type, e) => console.error(`[commoners] ${name} plugin (${type}) failed to execute:`, e)

export async function isPluginFeatureSupported(plugin, feature) {    

    if (!(feature in plugin)) return false

    // Special condition for capacitor plugins
    const isMobile = this.MOBILE
    if (isMobile && plugin.isSupported?.capacitor === false) return false

    // Check if the plugin supports the feature
    let supported = undefined

    if (typeof plugin.isSupported === 'function') supported = plugin.isSupported
    else supported = plugin.isSupported?.[feature]
    
    if (typeof supported === 'function') try { supported = await supported(this) } catch (e) { supported = false }

    if (supported === undefined) return true // Assume supported if not defined
    return supported
}

export function isPluginLoadable(plugin) {
    return isPluginFeatureSupported.call(this, plugin, 'load')
}

// const commonPluginFeatures = [ 'load', 'start', 'ready', 'quit' ]

// export async function isPluginSupported (plugin, target) {

//     const isDesktopBuild = target === 'desktop'

//     let { desktop } = plugin
//     if (desktop && isDesktopBuild) return true // Desktop plugins are always supported in desktop builds

//     const supported = []
//     for (const feature of commonPluginFeatures) {
//         const supported = await isPluginFeatureSupported.call(this, plugin, feature)
//         supported.push(supported)
//     }

//     return supported.some(supported => supported) // Support if any feature is supported
// }

export const sanitizePluginProperties = (plugin, target) => {
    const copy = { ...plugin }

    // Remove electron plugins if not the correct target
    const assumeRemoval = 'desktop' in copy && isDesktop(target)
    if (assumeRemoval) delete copy.desktop

    return copy
}
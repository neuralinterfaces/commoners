// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
export const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));


// Injected environment from the Commoners build process
export const pluginErrorMessage = (name, type, e) => console.error(`[commoners] ${name} plugin (${type}) failed to execute:`, e)


export const isPluginSupported = async (plugin, target) => {

    const isDesktopBuild = target === 'desktop'

    let { isSupported, desktop } = plugin
    if (isSupported && typeof isSupported === 'object') isSupported = isSupported[target]
    if (typeof isSupported === 'function') isSupported = await isSupported.call(plugin, target)
    if (isSupported === false) return // Explicit removal

    if (desktop) {
        if (isDesktopBuild) return true
        else return !!isSupported // Must be explicitly truthy
    }
    
    return isSupported !== false // Should just not be false
}

export const sanitizePluginProperties = (plugin, target) => {
    const copy = { ...plugin }

    // Remove electron plugins if not the correct target
    const assumeRemoval = 'desktop' in copy && target !== 'desktop'
    if (assumeRemoval) delete copy.desktop

    return copy
}
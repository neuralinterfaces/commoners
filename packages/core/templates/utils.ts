// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
export const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));


// Injected environment from the Commoners build process
export const pluginErrorMessage = (name, type, e) => console.error(`[commoners] ${name} plugin (${type}) failed to execute:`, e)


const removablePluginProperties = [ 'load' ]

export const sanitizePluginProperties = (plugin, target) => {
    const copy = {...plugin}

    const assumeRemoval = 'loadDesktop' in copy && target !== 'desktop' // Always clear main when not an electron build

    if (assumeRemoval) delete copy.loadDesktop 

    // Assume true if no main; assume false if main
    const willRemove = (v) => assumeRemoval ? !v : v === false

    // Remove any top-level properties that are flagged as unsupported
    const isSupported = copy.isSupported?.[target] ?? copy.isSupported // Drill to the target

    if (isSupported && typeof isSupported === 'object') {
        removablePluginProperties.forEach(prop => {
            if (willRemove(isSupported[prop])) delete copy[prop]
        })
    }

    return copy
}
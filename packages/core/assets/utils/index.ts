/**
 * Symbol used to mark lazy factory functions.
 * Users wrap their dynamic imports with `lazy()` to enable tree-shaking.
 */
export const LAZY_MARKER = Symbol.for('commoners:lazy')

/**
 * Mark a factory function as a lazy loader for tree-shaking.
 * Usage: `desktop: lazy(() => import('./desktop-hooks'))`
 */
export function lazy<T>(factory: () => Promise<T>): () => Promise<T> {
  ;(factory as any)[LAZY_MARKER] = true
  return factory
}

/**
 * Resolve a lazy factory value. Lazy factories are functions marked with
 * `lazy()` that return a Promise (e.g. `lazy(() => import('./module'))`).
 * If the value is not a lazy factory, it is returned as-is.
 */
export async function resolveLazy(value) {
  if (typeof value === 'function' && value[LAZY_MARKER]) {
    const resolved = await value()
    return resolved?.__esModule || resolved?.default !== undefined
      ? resolved.default
      : resolved
  }
  return value
}

const isDesktop = target => target === 'desktop' || target === 'electron' // Duplicated from globals.ts

// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
export const asyncFilter = async (arr, predicate) =>
  Promise.all(arr.map(predicate)).then(results => arr.filter((_v, index) => results[index]))

// Injected environment from the Commoners build process
export const pluginErrorMessage = (name, type, e) =>
  console.error(`[commoners] ${name} plugin (${type}) failed to execute:`, e)

export async function isPluginFeatureSupported(plugin, feature) {
  if (!(feature in plugin)) return false

  // Special condition for capacitor plugins
  const isMobile = this.MOBILE
  if (isMobile && plugin.isSupported?.capacitor === false) return false

  // Check if the plugin supports the feature
  let supported = undefined

  if (typeof plugin.isSupported === 'function') supported = plugin.isSupported
  else supported = plugin.isSupported?.[feature]

  if (typeof supported === 'function')
    try {
      supported = await supported(this)
    } catch (e) {
      supported = false
    }

  if (supported === undefined) return true // Assume supported if not defined
  return supported
}

export function isPluginLoadable(plugin) {
  return isPluginFeatureSupported.call(this, plugin, 'load')
}

export const sanitizePluginProperties = (plugin, target) => {
  const copy = { ...plugin }

  // Remove electron plugins if not the correct target
  const assumeRemoval = 'desktop' in copy && isDesktop(target)
  if (assumeRemoval) delete copy.desktop

  return copy
}

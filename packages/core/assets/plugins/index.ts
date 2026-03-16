import { isPluginFeatureSupported, pluginErrorMessage, resolveLazy } from '../utils/index.js'

async function executePluginHook(ctx: any, id: string, plugin: any, type: string, args: any[]) {
  const types = {
    start: type === 'start',
    ready: type === 'ready',
    quit: type === 'quit',
  }

  // Coordinate the state transitions for the plugins
  const { __state } = plugin
  if (types.start && __state) return
  if (types.ready && __state !== 'start') return
  plugin.__state = type

  const { DESKTOP, MOBILE, WEB, TARGET, DEV } = ctx.env
  const featureIsSupported = await isPluginFeatureSupported.call(
    {
      WEB,
      DESKTOP: DESKTOP ? TARGET : false,
      MOBILE: MOBILE ? TARGET : false,
      DEV: !!DEV,
      PROD: !DEV,
    },
    plugin,
    type
  )
  if (!featureIsSupported) return

  // Resolve lazy factory if present, then cache
  const method = await resolveLazy(plugin[type])
  if (method) {
    plugin[type] = method
    try {
      return await method.call(ctx.contexts[id], ...args, id)
    } catch (e) {
      pluginErrorMessage(id, type, e)
    }
  }
}

/**
 * Topological sort for plugins with `after` dependencies.
 * Plugins declare `after: ['pluginA', 'pluginB']` to ensure those plugins
 * run their hooks first. Plugins without `after` run in their original order.
 * Circular dependencies are detected and reported as warnings.
 */
function sortByDependencies(entries: [string, any][]): [string, any][] {
  const ids = entries.map(([id]) => id)
  const idSet = new Set(ids)
  const graph = new Map<string, Set<string>>()
  const pluginMap = new Map(entries)

  // Build dependency graph
  for (const [id, plugin] of entries) {
    const deps = new Set<string>()
    const after = plugin.after
    if (Array.isArray(after)) {
      for (const dep of after) {
        if (idSet.has(dep) && dep !== id) deps.add(dep)
      }
    }
    graph.set(id, deps)
  }

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>()
  for (const id of ids) inDegree.set(id, 0)
  const dependents = new Map<string, string[]>()
  for (const id of ids) dependents.set(id, [])
  for (const [id, deps] of graph) {
    for (const dep of deps) {
      dependents.get(dep)!.push(id)
      inDegree.set(id, (inDegree.get(id) || 0) + 1)
    }
  }

  const queue: string[] = []
  const originalOrder = new Map(ids.map((id, i) => [id, i]))

  // Start with plugins that have no dependencies, in original order
  for (const id of ids) {
    if ((inDegree.get(id) || 0) === 0) queue.push(id)
  }
  // Stable sort: within same dependency level, preserve original order
  queue.sort((a, b) => (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0))

  const sorted: [string, any][] = []
  const visited = new Set<string>()

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    sorted.push([id, pluginMap.get(id)!])

    const deps = dependents.get(id) || []
    // Sort dependents by original order for stability
    deps.sort((a, b) => (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0))
    for (const dep of deps) {
      const newDegree = (inDegree.get(dep) || 1) - 1
      inDegree.set(dep, newDegree)
      if (newDegree === 0) queue.push(dep)
    }
  }

  // Detect circular dependencies — unvisited plugins have cycles
  if (sorted.length < entries.length) {
    const missing = entries.filter(([id]) => !visited.has(id))
    for (const [id] of missing) {
      console.warn(
        `[commoners] Plugin '${id}' has circular 'after' dependencies — running in original order`
      )
    }
    sorted.push(...missing)
  }

  return sorted
}

/**
 * Unload a single plugin by calling its `unload` hook and removing it from the loaded set.
 * Used for dev-mode hot reload of plugins.
 */
export function unloadPlugin(id: string, plugin: any, env: any, loaded: Record<string, any>): void {
  try {
    if (plugin.unload) plugin.unload(env)
  } catch (e) {
    pluginErrorMessage(id, 'unload', e)
  }
  delete loaded[id]
}

export async function runAppPlugins(args: any[] = [], type = 'start') {
  const entries = Object.entries(this.plugins)

  // Run ready() hooks sequentially — plugins that create windows in ready()
  // trigger renderer-side code that depends on IPC handlers registered by
  // other plugins' ready() hooks. Running concurrently causes race conditions
  // where the renderer fires IPC before handlers are registered.
  //
  // Plugins can declare `after: ['pluginA', 'pluginB']` to ensure those
  // plugins complete their ready() hooks first, regardless of config order.
  if (type === 'ready') {
    const sorted = sortByDependencies(entries)
    const results: any[] = []
    for (const [id, plugin] of sorted) {
      if (process?.stderr?.write) process.stderr.write(`[commoners:ready] ${id} starting...\n`)
      const result = await executePluginHook(this, id, plugin as any, type, args)
      if (process?.stderr?.write) process.stderr.write(`[commoners:ready] ${id} completed\n`)
      results.push(result)
    }
    return results
  }

  // start() and quit() hooks can run concurrently — they don't create windows
  return await Promise.all(
    entries.map(([id, plugin]) => executePluginHook(this, id, plugin as any, type, args))
  )
}

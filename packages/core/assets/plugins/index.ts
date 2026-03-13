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

export async function runAppPlugins(args: any[] = [], type = 'start') {
  const entries = Object.entries(this.plugins)

  // Run ready() hooks sequentially — plugins that create windows in ready()
  // trigger renderer-side code that depends on IPC handlers registered by
  // other plugins' ready() hooks. Running concurrently causes race conditions
  // where the renderer fires IPC before handlers are registered.
  if (type === 'ready') {
    const results: any[] = []
    for (const [id, plugin] of entries) {
      results.push(await executePluginHook(this, id, plugin as any, type, args))
    }
    return results
  }

  // start() and quit() hooks can run concurrently — they don't create windows
  return await Promise.all(
    entries.map(([id, plugin]) => executePluginHook(this, id, plugin as any, type, args))
  )
}

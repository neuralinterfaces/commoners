import { isPluginFeatureSupported } from '../utils/index.js'

export async function runAppPlugins (
  args: any[] = [], 
  type = 'start'
) {

    return await Promise.all(Object.entries(this.plugins).map(async ([ id, plugin ]: [string, any]) => {
      
      const types = {
        start: type === "start",
        ready: type === "ready",
        quit: type === "quit"
      }
  
      // Coordinate the state transitions for the plugins
      const { __state } = plugin
      if (types.start && __state) return
      if (types.ready && __state !== "start") return
      plugin.__state = type

      const { DESKTOP, MOBILE, WEB, TARGET, DEV } = this.env
      const featureIsSupported = await isPluginFeatureSupported.call({ WEB, DESKTOP: DESKTOP ? TARGET : false,  MOBILE: MOBILE ? TARGET : false, DEV: !!DEV, PROD: !DEV }, plugin, type)
      if (!featureIsSupported) return
      
      return plugin[type].call(this.contexts[id], ...args, id)
  
    }))
  
  }
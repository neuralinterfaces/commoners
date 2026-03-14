import type { CommonersGlobalObject, SpecificTargetType } from '../../types'

export type CommonersAsyncAPI = {
  is: (check: 'desktop' | 'mobile' | 'web' | 'dev') => boolean
  whenReady: () => Promise<any>
  getService: (id: string) => Promise<{ url: string } | undefined>
  backend: () => SpecificTargetType
  on: (event: string, cb: (...args: any[]) => void) => () => void
  once: (event: string, cb: (...args: any[]) => void) => () => void
}

export function createAsyncAPI(env: CommonersGlobalObject): CommonersAsyncAPI {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  function emit(event: string, ...args: any[]) {
    const cbs = listeners.get(event)
    if (cbs) cbs.forEach(cb => cb(...args))
  }

  function on(event: string, cb: (...args: any[]) => void): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(cb)
    return () => listeners.get(event)?.delete(cb)
  }

  function once(event: string, cb: (...args: any[]) => void): () => void {
    const wrapped = (...args: any[]) => {
      off()
      cb(...args)
    }
    const off = on(event, wrapped)
    return off
  }

  // Fire 'ready' event when READY resolves
  env.READY.then(plugins => emit('ready', plugins))

  return {
    is(check) {
      switch (check) {
        case 'desktop': return !!env.DESKTOP
        case 'mobile': return !!env.MOBILE
        case 'web': return !!env.WEB
        case 'dev': return !!env.DEV
        default: return false
      }
    },

    whenReady() {
      return env.READY
    },

    async getService(id) {
      const services = env.SERVICES
      if (!services) return undefined
      const service = services[id]
      if (!service) return undefined
      return { url: service.url }
    },

    backend() {
      return env.TARGET
    },

    on,
    once,
  }
}

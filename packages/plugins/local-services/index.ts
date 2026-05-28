/**
 * @commoners/local-services
 *
 * Runtime service discovery via mDNS/Bonjour.
 * Discovers other Commoners instances on the local network
 * and publishes your services for others to find.
 *
 * Uses the shared mDNS utility from core (same as `commoners share`).
 */

import type { Plugin } from '@commoners/solidarity'

const DEFAULT_TYPE = 'http'

type LocalServicePluginOptions = {
  type?: string
  register?: true | string[]
}

export default ({ type = DEFAULT_TYPE, register = [] }: LocalServicePluginOptions) => {
  const registerAll = register === true
  let mdns: any = null

  return {
    capabilities: {
      provides: ['local-services', 'service-discovery', 'mdns'],
      platforms: { desktop: true },
      runtime: 'browser' as const,
    },

    isSupported: ({ DESKTOP, DEV }) => DESKTOP || DEV,

    load() {
      const discovered: Record<string, any> = {}

      return {
        getServices: async () => {
          return new Promise(resolve => {
            this.once('services', (_, services) => resolve(services))
            this.send('get-services')
          })
        },
        onServiceUp: (callback) => this.on('up', (_, svc) => callback(svc)),
        onServiceDown: (callback) => this.on('down', (_, svc) => callback(svc)),
      }
    },

    start: async function (services) {
      // Dynamic import of bonjour-service directly (same pattern as core/utils/mdns.ts)
      try {
        const { Bonjour } = await import('bonjour-service')
        const bonjour = new Bonjour()
        mdns = {
          publish: (svc) => bonjour.publish({ name: svc.name, type, port: svc.port, txt: { id: svc.id, url: svc.url } }),
          browse: (t, onUp, onDown) => {
            const browser = bonjour.find({ type: t }, (s) => onUp({ name: s.name, host: s.host, ip: s.referer?.address ?? s.host, port: s.port, url: `http://${s.host}:${s.port}`, metadata: s.txt ?? {} }))
            browser.on('down', (s) => onDown({ name: s.name, host: s.host, ip: s.referer?.address ?? s.host, port: s.port, url: `http://${s.host}:${s.port}`, metadata: s.txt ?? {} }))
            browser.start()
          },
          unpublishAll: () => bonjour.unpublishAll(),
          destroy: () => { bonjour.unpublishAll(); bonjour.destroy() },
        }
      } catch { return }
      if (!mdns) return

      // Browse for services
      const active: Record<string, any> = {}
      mdns.browse(type,
        (svc) => { active[svc.url] = svc; this.send('up', svc) },
        (svc) => { delete active[svc.url]; this.send('down', svc) }
      )

      // Respond to service queries
      this.on('get-services', () => this.send('services', active))

      // Mark services to register as public
      const toRegister = registerAll ? Object.keys(services) : register
      toRegister.forEach(id => {
        const service = services[id]
        if (service) service.public = true
      })
    },

    ready: async function (services, pluginId) {
      if (!mdns) return
      const toRegister = registerAll ? Object.keys(services) : register

      for (const id of toRegister) {
        const service = services[id]
        if (!service?.url) continue
        const port = parseInt(new URL(service.url).port)
        if (!port) continue
        mdns.publish({
          id,
          name: `commoners-${pluginId}-${id}`,
          port,
          url: service.url,
        })
        if (service.process) {
          service.process.on('close', () => mdns?.unpublishAll())
        }
      }
    },

    quit: async function () {
      mdns?.destroy()
      mdns = null
    },
  } as Plugin
}

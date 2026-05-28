/**
 * Shared mDNS/Bonjour utilities for service advertisement and discovery.
 * Used by both `commoners share` (CLI) and `@commoners/local-services` (plugin).
 */

import { createLogger } from '../assets/utils/logger.js'

const logger = createLogger('mdns')

export type PublishedService = {
  id: string
  name: string
  port: number
  url: string
  meta?: Record<string, string>
}

export type DiscoveredService = {
  name: string
  host: string
  ip: string
  port: number
  url: string
  metadata: Record<string, string>
}

export type MDNSHandle = {
  publish: (service: PublishedService) => void
  unpublishAll: () => void
  browse: (type: string, onUp: (svc: DiscoveredService) => void, onDown: (svc: DiscoveredService) => void) => void
  destroy: () => void
}

function sanitizeDiscovered(service: any): DiscoveredService {
  return {
    name: service.name,
    host: service.host,
    ip: service.referer?.address ?? service.host,
    port: service.port,
    url: `http://${service.host}:${service.port}`,
    metadata: service.txt ?? {},
  }
}

/**
 * Create an mDNS handle. Returns null if bonjour-service is not available.
 */
export async function createMDNS(): Promise<MDNSHandle | null> {
  try {
    const { Bonjour } = await import('bonjour-service')
    const bonjour = new Bonjour()

    return {
      publish(service: PublishedService) {
        bonjour.publish({
          name: service.name,
          type: 'http',
          port: service.port,
          txt: { id: service.id, url: service.url, ...service.meta },
        })
        logger.info(`Published "${service.id}" on mDNS (port ${service.port})`)
      },

      unpublishAll() {
        bonjour.unpublishAll()
      },

      browse(type: string, onUp: (svc: DiscoveredService) => void, onDown: (svc: DiscoveredService) => void) {
        const browser = bonjour.find({ type }, (service) => {
          onUp(sanitizeDiscovered(service))
        })
        browser.on('down', (service) => {
          onDown(sanitizeDiscovered(service))
        })
        browser.start()
      },

      destroy() {
        bonjour.unpublishAll()
        bonjour.destroy()
      },
    }
  } catch {
    logger.debug('bonjour-service not available')
    return null
  }
}

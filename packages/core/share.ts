/**
 * Share services on the local network via Bonjour/mDNS
 *
 * Resolves, builds, and starts services, then advertises them
 * on the local network so other devices can discover them.
 */

import { resolveConfig } from './index.js'
import { buildServices } from './build.js'
import { createAll } from './assets/services/index.js'
import { getLocalIP } from './assets/services/ip.js'
import { getServices } from './utils/extensions.js'
import { createLogger } from './assets/utils/logger.js'

import type { UserConfig, ResolvedConfig } from './types.js'

const logger = createLogger('share')

export interface ShareOptions {
  services?: string[]
  port?: number
  hooks?: any
}

export interface ShareResult {
  active: Record<string, any>
  resolved: Record<string, any>
  localIP: string
  cleanup: () => void
}

export async function shareServices(
  config: UserConfig,
  options: ShareOptions = {}
): Promise<ShareResult> {
  const { services: selectedServices, port, hooks } = options

  // Resolve config in dev mode (services go to .commoners/.tmp/services/)
  const resolvedConfig: ResolvedConfig = await resolveConfig(config, {
    services: selectedServices,
    build: false,
  })

  const { root } = resolvedConfig
  const allServices = getServices(resolvedConfig.extensions)
  const serviceNames = Object.keys(allServices)

  if (serviceNames.length === 0) {
    throw new Error('No services found in configuration')
  }

  // Override port for single-service sharing
  if (port && serviceNames.length === 1) {
    const name = serviceNames[0]
    const svc = allServices[name]
    if (typeof svc === 'object' && svc !== null) {
      svc.port = port
    }
  }

  // Build services in dev mode
  await buildServices(config, {
    dev: true,
    services: selectedServices,
  })

  // Create and start services
  const output = await createAll(allServices, {
    root,
    target: 'web',
    build: false,
    hooks,
  })

  const { active = {}, resolved = {}, close: closeServices } = output

  // Publish via Bonjour (dynamic import so the dependency is optional)
  let bonjourCleanup = () => {}
  try {
    const { Bonjour } = await import('bonjour-service')
    const bonjour = new Bonjour()

    for (const [id, service] of Object.entries(active)) {
      const svc = service as any
      if (!svc.url) continue
      try {
        const url = new URL(svc.url)
        const servicePort = parseInt(url.port)
        if (!servicePort) continue
        bonjour.publish({
          name: `commoners-${id}`,
          type: 'http',
          port: servicePort,
          txt: { id, url: svc.url },
        })
        logger.info(`Published ${id} on mDNS (port ${servicePort})`)
      } catch (e) {
        logger.warn(`Failed to publish ${id} on mDNS: ${(e as Error).message}`)
      }
    }

    bonjourCleanup = () => {
      bonjour.unpublishAll()
      bonjour.destroy()
    }
  } catch {
    logger.debug('bonjour-service not available, skipping mDNS advertisement')
  }

  const localIP = getLocalIP()

  const cleanup = () => {
    bonjourCleanup()
    closeServices()
  }

  return { active, resolved, localIP, cleanup }
}

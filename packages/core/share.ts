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
import { createMDNS } from './utils/mdns.js'

import type { UserConfig, ResolvedConfig } from './types.js'

export interface ShareOptions {
  services?: string[]
  port?: number
  hooks?: any
  meta?: Record<string, string>
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
  const { services: selectedServices, port, hooks, meta } = options

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

  // Publish via shared mDNS utility
  const mdns = await createMDNS()
  if (mdns) {
    for (const [id, service] of Object.entries(active)) {
      const svc = service as any
      if (!svc.url) continue
      try {
        const url = new URL(svc.url)
        const servicePort = parseInt(url.port)
        if (!servicePort) continue
        mdns.publish({ id, name: `commoners-${id}`, port: servicePort, url: svc.url, meta })
      } catch { /* skip invalid URLs */ }
    }
  }

  const localIP = getLocalIP()

  const cleanup = () => {
    mdns?.destroy()
    closeServices()
  }

  return { active, resolved, localIP, cleanup }
}

/**
 * Build Adapter Registry
 *
 * Manages build adapter instances. Defaults to Vite.
 * Apps can override by setting a custom adapter before build/start.
 */

import type { BuildAdapter, ServiceBundler } from './types.js'
import { createViteAdapter } from './vite.js'

let globalAdapter: BuildAdapter | null = null
const serviceBundlers = new Map<string, ServiceBundler>()

/**
 * Get the current build adapter. Defaults to Vite.
 */
export function getBuildAdapter(): BuildAdapter {
  if (!globalAdapter) globalAdapter = createViteAdapter()
  return globalAdapter
}

/**
 * Set a custom build adapter (e.g., for Rolldown migration).
 */
export function setBuildAdapter(adapter: BuildAdapter): void {
  globalAdapter = adapter
}

/**
 * Register a service bundler for a set of file extensions.
 */
export function registerServiceBundler(bundler: ServiceBundler): void {
  for (const ext of bundler.extensions) {
    serviceBundlers.set(ext, bundler)
  }
}

/**
 * Get a service bundler for a file extension.
 */
export function getServiceBundler(extension: string): ServiceBundler | undefined {
  return serviceBundlers.get(extension)
}

// Re-export types
export type {
  BuildAdapter,
  ServiceBundler,
  AdapterConfig,
  AdapterBuildResult,
  AdapterDevServer,
} from './types.js'

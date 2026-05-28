/**
 * Build operations using Flow architecture
 * Provides backward-compatible API while delegating to new BuildFlow
 */

import { join, resolve } from 'node:path'
import { createLogger } from './assets/utils/logger.js'
import { createBuildFlow } from './flows/index.js'
import { resolveConfig } from './index.js'
import { getServiceAssets, buildAssets, getServicesToBuild } from './utils/assets.js'
import { globalWorkspacePath } from './globals.js'

import type {
  BuildHooks,
  ServiceBuildOptions,
  UserConfig,
} from './types.js'
import type { Logger } from './assets/utils/logger.js'
import { BuiltAppMetadata } from './flows/BuildFlow.js'
import { globalServiceWorkspacePath, globalTempServiceWorkspacePath } from './assets/services/paths.js'

// Lazy logger instance (created on first use)
let logger: Logger
function getLogger() {
  if (!logger) {
    logger = createLogger('build')
  }
  return logger
}

// Lazy singleton flow instance (created on first use)
let buildFlow: ReturnType<typeof createBuildFlow> | null = null
function getBuildFlow() {
  if (!buildFlow) {
    buildFlow = createBuildFlow()
  }
  return buildFlow
}

// ------------------------ Main Exports ------------------------

/**
 * Build services for a configuration
 * Standalone service building without full app build
 */
export const buildServices = async (
  config: UserConfig = {},
  options: ServiceBuildOptions = {}
): Promise<any[]> => {
  const { dev = false, services, rebuild = true } = options
  const { outDir } = options

  getLogger().debug('Building services', { dev, rebuild, serviceCount: services?.length })

  // In dev mode, resolve with build: false so service filepaths use the temp directory
  // (.commoners/.tmp/services/) matching what the Electron main process expects.
  // In production, resolve with build: true for the standard output directory.
  const resolvedConfig = await resolveConfig(config, { services, build: !dev })
  const { hooks } = resolvedConfig
  const { root, target } = resolvedConfig

  const servicesToBuild = getServicesToBuild(resolvedConfig, dev)
  if (servicesToBuild.length === 0) {
    getLogger().debug('No services to build')
    return []
  }

  getLogger().debug('Emitting build:assets:start', { phase: 'services', serviceCount: servicesToBuild.length })
  hooks.emit({
    type: 'build:assets:start',
    phase: 'services',
    services: servicesToBuild,
  })


  const assets = await getServiceAssets(resolvedConfig, dev, rebuild, hooks)
  const defaultServiceDir = dev ? globalTempServiceWorkspacePath : globalServiceWorkspacePath
  const resolvedOutDir = outDir ?? resolve(join(root, defaultServiceDir))
  const results = await buildAssets(assets, { root, outDir: resolvedOutDir, target, dev })

  getLogger().debug('Emitting build:assets:complete', { phase: 'services', resultCount: results.length })
  hooks.emit({ type: 'build:assets:complete', phase: 'services' })

  getLogger().info('Services built successfully', { count: results.length })

  return results
}

/**
 * Build application using new Flow architecture
 * Delegates to BuildFlow for orchestration
 *
 * @param config - User configuration
 * @param options - Build options and hooks
 * @returns Output directory path
 */
export async function buildApp(
  config: UserConfig = {},
  options: BuildHooks = {}
): Promise<BuiltAppMetadata> {
  getLogger().debug('Starting app build with flow architecture')

  try {
    // Delegate to BuildFlow for orchestration
    const metadata = await getBuildFlow().buildApp(config, options)
    getLogger().info('App build completed', metadata)
    return metadata
  } catch (error) {
    getLogger().error('App build failed', {}, error as Error)
    throw error
  }
}

// Export for backward compatibility and direct access
export { buildFlow }

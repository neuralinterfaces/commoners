/**
 * Launch operations using Flow architecture
 * Provides backward-compatible API while delegating to new LaunchFlow
 */

import { join } from 'node:path'
import { createLogger } from './assets/utils/logger.js'
import { createLaunchFlow } from './flows/index.js'
import { resolveConfig } from './index.js'
import { globalWorkspacePath } from './globals.js'
import { createAll } from './assets/services/index.js'
import { ValidationError } from './errors.js'

import type { ConfigResolveOptions, LaunchConfig } from './types.js'
import type { Logger } from './assets/utils/logger.js'

// Lazy logger instance (created on first use)
let logger: Logger
function getLogger() {
  if (!logger) {
    logger = createLogger('launch')
  }
  return logger
}

// Lazy singleton flow instance (created on first use)
let launchFlow: ReturnType<typeof createLaunchFlow> | null = null
function getLaunchFlow() {
  if (!launchFlow) {
    launchFlow = createLaunchFlow()
  }
  return launchFlow
}

// ------------------------ Main Exports ------------------------

/**
 * Launch services for a configuration
 * Standalone service launching without full app launch
 */
export const launchServices = async (
  config: LaunchConfig,
  opts?: { services: ConfigResolveOptions['services'] }
): Promise<any> => {
  getLogger().debug('Launching services')

  const resolvedConfig = await resolveConfig(config, { ...opts, build: true })
  const { target, root, services } = resolvedConfig

  const serviceNames = Object.keys(services)
  if (!serviceNames.length) {
    throw new ValidationError(
      'No services specified',
      'You must specify at least one service to launch. Check your configuration.'
    )
  }

  getLogger().info('Creating services', { count: serviceNames.length })

  // Ensure users can access the created services
  return await createAll(services, { root, target, services: true, build: true })
}

/**
 * Resolve the output directory for app launch
 */
export const resolveAppToLaunch = (config: LaunchConfig): string => {
  const { root, outDir } = config

  if (outDir) {
    getLogger().debug('Using specified output directory', { outDir })
    return outDir
  }

  const { target } = config
  const resolvedOutDir = join(root ?? '', globalWorkspacePath, target)

  getLogger().debug('Using default output directory', { outDir: resolvedOutDir })

  return resolvedOutDir
}

/**
 * Launch application using new Flow architecture
 * Delegates to LaunchFlow for orchestration
 *
 * @param config - Launch configuration
 * @param args - Additional launch arguments (currently unused in new architecture)
 * @returns Launch result with server info (for web) or empty object
 */
export const launchApp = async (
  config: LaunchConfig,
): Promise<any> => {
  getLogger().debug('Starting app launch with flow architecture')

  try {
    // Resolve configuration first
    const resolvedConfig = await resolveConfig(config)
    const { hooks } = resolvedConfig

    // Extract launch options
    const { port, public: isPublic } = resolvedConfig
    
    // Delegate to LaunchFlow for orchestration
    const result = await getLaunchFlow().launch(resolvedConfig, {
      hooks,
      port,
      host: isPublic ? '0.0.0.0' : undefined,
    })

    logger.info('App launch completed successfully')

    return result
  } catch (error) {
    logger.error('App launch failed', {}, error as Error)
    throw error
  }
}

// Export for backward compatibility and direct access
export { launchFlow }

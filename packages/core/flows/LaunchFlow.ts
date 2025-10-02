/**
 * Generic launch flow orchestrator
 * Implements the Template Method pattern for launch operations
 */

import { createLogger } from '../utils/logger.js'
import type { UserConfig, HooksInterface } from '../types.js'
import { resolveConfig, resolveHooks } from '../index.js'

const logger = createLogger('launch-flow')

/**
 * Platform-specific launch strategy interface
 */
export interface LaunchStrategy {
  /**
   * Platform identifier (e.g., 'electron', 'web', 'mobile')
   */
  readonly platform: string

  /**
   * Check if this strategy should handle the given target
   */
  canHandle(target: string): boolean

  /**
   * Prepare launch environment (e.g., start dev server, setup watchers)
   */
  prepare(context: LaunchContext): Promise<void>

  /**
   * Launch the application
   */
  launch(context: LaunchContext): Promise<void>

  /**
   * Cleanup on shutdown
   */
  cleanup(context: LaunchContext): Promise<void>
}

/**
 * Launch context shared across all launch steps
 */
export interface LaunchContext {
  config: UserConfig
  resolvedConfig: any
  hooks: HooksInterface
  target: string
  root: string
  outDir: string
  dev: boolean
  port?: number
  host?: string
}

/**
 * Launch orchestrator using Strategy pattern
 * Coordinates the launch process using platform-specific strategies
 */
export class LaunchFlow {
  private strategies = new Map<string, LaunchStrategy>()
  private logger = createLogger('LaunchFlow')

  /**
   * Register a platform-specific launch strategy
   */
  registerStrategy(strategy: LaunchStrategy): void {
    this.strategies.set(strategy.platform, strategy)
    this.logger.debug(`Registered launch strategy: ${strategy.platform}`)
  }

  /**
   * Get strategy for a given target
   */
  private getStrategy(target: string): LaunchStrategy | null {
    // Find first strategy that can handle this target
    for (const strategy of this.strategies.values()) {
      if (strategy.canHandle(target)) {
        return strategy
      }
    }
    return null
  }

  /**
   * Launch application using appropriate platform strategy
   */
  async launch(
    config: UserConfig = {},
    options: {
      hooks?: HooksInterface
      dev?: boolean
      port?: number
      host?: string
    } = {}
  ): Promise<void> {
    const { hooks: optHooks, dev = true, port, host } = options

    // Resolve hooks
    const hooks = (config.hooks = await resolveHooks(config.hooks, optHooks))

    try {
      // Resolve configuration
      const resolvedConfig = await resolveConfig(config, { build: false })
      const { root, target } = resolvedConfig

      this.logger.info('Starting launch', { target, dev, port, host })

      // Emit launch start event
      hooks.emit({ type: 'launch:start', config: resolvedConfig })

      // Get the appropriate launch strategy
      const strategy = this.getStrategy(target)
      if (!strategy) {
        throw new Error(`No launch strategy found for target: ${target}`)
      }

      this.logger.info(`Using ${strategy.platform} launch strategy`)

      // Build context
      const context: LaunchContext = {
        config,
        resolvedConfig,
        hooks,
        target,
        root,
        outDir: '', // Will be set by strategy
        dev,
        port,
        host,
      }

      // Execute launch flow
      await this.executeLaunchFlow(context, strategy)

      this.logger.info('Launch completed successfully')
    } catch (error) {
      hooks.emit({
        type: 'launch:error',
        error: error as Error,
      })

      this.logger.error('Launch failed', {}, error as Error)
      throw error
    }
  }

  /**
   * Execute the launch flow (Template Method)
   */
  private async executeLaunchFlow(
    context: LaunchContext,
    strategy: LaunchStrategy
  ): Promise<void> {
    try {
      // Step 1: Prepare launch environment
      await strategy.prepare(context)

      // Step 2: Launch the application
      await strategy.launch(context)

      // Emit launch complete event
      context.hooks.emit({ type: 'launch:complete' })
    } catch (error) {
      // Cleanup on error
      await strategy.cleanup(context).catch((cleanupError) => {
        this.logger.error('Cleanup failed', {}, cleanupError as Error)
      })
      throw error
    }
  }
}

/**
 * Base class for platform-specific launch strategies
 * Provides common utilities and default implementations
 */
export abstract class BaseLaunchStrategy implements LaunchStrategy {
  abstract readonly platform: string
  protected logger = createLogger('LaunchStrategy')

  abstract canHandle(target: string): boolean

  abstract prepare(context: LaunchContext): Promise<void>

  abstract launch(context: LaunchContext): Promise<void>

  async cleanup(context: LaunchContext): Promise<void> {
    // Default: no cleanup
    this.logger.debug(`No cleanup needed for ${this.platform}`)
  }
}

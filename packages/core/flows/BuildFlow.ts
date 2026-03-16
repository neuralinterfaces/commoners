/**
 * Generic build flow orchestrator
 * Implements the Template Method pattern for build operations
 */

import { join, resolve, isAbsolute } from 'node:path'
import { createLogger } from '../assets/utils/logger.js'
import type {
  UserConfig,
  BuildHooks,
  HooksInterface,
  ResolvedConfig,
  ServiceRebuildOption,
} from '../types.js'
import { resolveConfig, resolveHooks } from '../index.js'
import { getAppAssets, getServiceAssets, buildAssets, getServicesToBuild } from '../utils/assets.js'
import { removeDirectory } from '../utils/files.js'
import {
  globalWorkspacePath,
  globalTempDir,
  handleTemporaryDirectories,
  isDesktop,
} from '../globals.js'
import { getBuildAdapter } from '../adapters/index.js'
import { globalServiceWorkspacePath } from '../assets/services/paths.js'

const resolveOutDir = (context: BuildContext): string => context.stagingDir || context.outDir

export interface BuiltAppMetadata {
  artifact: string
  web: string
}

/**
 * Platform-specific build strategy interface
 */
export interface BuildStrategy {
  /**
   * Platform identifier (e.g., 'electron', 'ios', 'android', 'web')
   */
  readonly platform: string

  /**
   * Check if this strategy should handle the given target
   */
  canHandle(target: string): boolean

  /**
   * Pre-build preparation (e.g., clean directories, setup environment)
   */
  prepare(context: BuildContext): Promise<void>

  /**
   * Build platform-specific artifacts
   */
  build(context: BuildContext): Promise<void>

  /**
   * Post-build cleanup and packaging
   */
  finalize(context: BuildContext): Promise<void>

  /**
   * Get platform-specific output directory structure
   */
  getOutputDir(root: string, target: string, isDev: boolean): string
}

type BuildServiceRebuildOptions = { force?: boolean; outDir?: string } | ServiceRebuildOption

/**
 * Build context shared across all build steps
 */
export interface BuildContext {
  config: ResolvedConfig
  hooks: HooksInterface
  target: string
  root: string
  outDir: string
  stagingDir: string // Temporary directory where Vite outputs frontend assets during build
  dev: boolean
  overwrite: boolean
  rebuildServices: BuildServiceRebuildOptions
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  onBuildAssets?: Function | null
  assets: any[] // Collection of built assets
}

/**
 * Build orchestrator using Strategy pattern
 * Coordinates the build process using platform-specific strategies
 */
export class BuildFlow {
  private strategies = new Map<string, BuildStrategy>()
  private logger = createLogger('BuildFlow')

  /**
   * Register a platform-specific build strategy
   */
  registerStrategy(strategy: BuildStrategy): void {
    this.strategies.set(strategy.platform, strategy)
    this.logger.debug(`Registered build strategy: ${strategy.platform}`)
  }

  /**
   * Get strategy for a given target
   */
  private getStrategy(target: string): BuildStrategy | null {
    // Find first strategy that can handle this target
    for (const strategy of this.strategies.values()) {
      if (strategy.canHandle(target)) {
        return strategy
      }
    }
    return null
  }

  /**
   * Build application using appropriate platform strategy
   */
  async buildApp(config: UserConfig = {}, options: BuildHooks = {}): Promise<BuiltAppMetadata> {
    const {
      onBuildAssets,
      dev = false,
      rebuildServices = isDesktop(config.target) ? { force: false } : false, // Default to true for desktop targets
      overwrite = false,
      hooks: optHooks,
    } = options

    // Resolve hooks first
    const hooks = (config.hooks = await resolveHooks(config.hooks, optHooks))

    try {
      // Resolve configuration
      const resolvedConfig = await resolveConfig(config, { build: true })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { root, target, build: _build = {} } = resolvedConfig

      this.logger.info('Starting build', { target, dev, root })

      // Emit build start event
      this.logger.debug('Emitting build:start', { config: resolvedConfig.name, target, dev })
      hooks.emit({ type: 'build:start', config: resolvedConfig, dev })

      // Get the appropriate build strategy
      const strategy = this.getStrategy(target)
      if (!strategy) {
        throw new Error(`No build strategy found for target: ${target}`)
      }

      this.logger.info(`Using ${strategy.platform} build strategy`)

      // Determine output directory
      const defaultOutDir = join(root, globalWorkspacePath, target)
      const selectedOutDir = resolvedConfig.outDir ?? defaultOutDir

      // Build context
      const context: BuildContext = {
        config: resolvedConfig,
        hooks,
        target,
        root,
        outDir: selectedOutDir,
        stagingDir: selectedOutDir, // Temporary directory for frontend assets
        dev,
        overwrite,
        rebuildServices,
        onBuildAssets,
        assets: [],
      }

      // Execute build flow using strategy
      await this.executeBuildFlow(context, strategy)

      // Emit build complete event
      this.logger.debug('Emitting build:complete', {
        config: resolvedConfig.name,
        outDir: context.outDir,
      })
      hooks.emit({ type: 'build:complete', config: resolvedConfig, outDir: context.outDir })

      this.logger.info('Build completed successfully', { outDir: context.outDir })

      return {
        artifact: dev ? context.stagingDir : context.outDir,
        web: context.stagingDir,
      }
    } catch (error) {
      this.logger.debug('Emitting build:error', { error: (error as Error).message })
      hooks.emit({
        type: 'build:error',
        error: error as Error,
      })

      this.logger.error('Build failed', {}, error as Error)
      throw error
    }
  }

  /**
   * Execute the build flow (Template Method)
   */
  private async executeBuildFlow(context: BuildContext, strategy: BuildStrategy): Promise<void> {
    const { dev } = context

    // Step 1: Prepare build environment
    await strategy.prepare(context)

    // Step 2: Build frontend assets
    await this.buildFrontendAssets(context)

    // Step 3: Build app-specific assets
    await this.buildAppAssets(context)

    // Step 4: Build services (if applicable)
    if (context.rebuildServices) await this.buildServices(context)

    // Step 5: Execute custom asset callback
    if (context.onBuildAssets) {
      const outDir = resolveOutDir(context)
      const result = context.onBuildAssets(outDir)
      if (result === null) {
        this.logger.info('Build cancelled by onBuildAssets callback')
        return
      }
    }

    // Step 6: Platform-specific build and packaging
    if (!dev) await strategy.build(context)

    // Step 7: Finalize build
    await strategy.finalize(context)
  }

  /**
   * Build frontend assets using the configured build adapter (default: Vite)
   */
  private async buildFrontendAssets(context: BuildContext): Promise<void> {
    const { config, hooks, dev, root } = context

    this.logger.debug('Emitting build:assets:start', { phase: 'frontend' })
    hooks.emit({ type: 'build:assets:start', phase: 'frontend' })

    const outDir = resolveOutDir(context)
    const adapter = getBuildAdapter()

    this.logger.debug(`Using ${adapter.name} build adapter for frontend assets`)
    await adapter.build({ root, outDir, config, dev, hooks })

    this.logger.debug('Emitting build:assets:complete', { phase: 'frontend' })
    hooks.emit({ type: 'build:assets:complete', phase: 'frontend' })
    this.logger.debug('Frontend assets built', { outDir })
  }

  /**
   * Build app-specific assets
   */
  private async buildAppAssets(context: BuildContext): Promise<void> {
    const { config, dev, root, target } = context
    const outDir = resolveOutDir(context)
    const assets = await getAppAssets(config, dev, outDir)
    const output = await buildAssets(assets, { outDir, root, target })
    context.assets.push(...output)
    this.logger.debug('App assets built')
  }

  /**
   * Build services
   */
  private async buildServices(context: BuildContext): Promise<void> {
    const { config, dev, hooks, root, target, rebuildServices } = context
    const servicesToBuild = getServicesToBuild(config, dev)
    if (servicesToBuild.length === 0) return this.logger.debug('No services to build')

    this.logger.debug('Emitting build:assets:start', {
      phase: 'services',
      services: servicesToBuild,
    })
    hooks.emit({ type: 'build:assets:start', phase: 'services', services: servicesToBuild })

    const isRebuildConfig =
      rebuildServices && typeof rebuildServices === 'object' && !Array.isArray(rebuildServices)
    const resolvedOutDir =
      (isRebuildConfig ? rebuildServices.outDir : '') ||
      context.stagingDir ||
      resolve(join(root, globalServiceWorkspacePath))

    const resolvedRebuild = (
      isRebuildConfig ? rebuildServices.force : rebuildServices
    ) as ServiceRebuildOption
    const assets = await getServiceAssets(config, dev, resolvedRebuild, hooks)
    const results = await buildAssets(assets, { root, outDir: resolvedOutDir, target, dev })
    context.assets.push(...results)

    this.logger.debug('Emitting build:assets:complete', { phase: 'services' })
    hooks.emit({ type: 'build:assets:complete', phase: 'services' })
    this.logger.info('Services built', { count: results.length })
  }
}

/**
 * Base class for platform-specific build strategies
 * Provides common utilities and default implementations
 */
export abstract class BaseBuildStrategy implements BuildStrategy {
  abstract readonly platform: string
  protected logger = createLogger('BuildStrategy')

  abstract canHandle(target: string): boolean

  async prepare(context: BuildContext): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { config, root, dev: _dev, overwrite: _overwrite } = context

    // Ensure root is absolute
    const absoluteRoot = isAbsolute(root) ? root : resolve(root)

    // Setup temporary directories
    const customTempDir = this.shouldUseTempDir(context.target)
    if (customTempDir) {
      const tempDir = this.getTempDir(absoluteRoot, context.target)
      const modifiedConfig = { ...config }
      delete modifiedConfig.outDir // Ensure outDir is not set to avoid conflicts
      handleTemporaryDirectories(modifiedConfig)
      context.stagingDir = tempDir // Already absolute since we use absoluteRoot
      this.logger.debug('Using temporary directory', { tempDir })
    } else await removeDirectory(context.outDir) // Clear output directory if not using temp dir
  }

  async build(_context: BuildContext): Promise<void> {
    // Default: no additional build steps
    this.logger.debug(`No additional build steps for ${this.platform}`)
  }

  async finalize(_context: BuildContext): Promise<void> {
    this.logger.debug(`No finalization steps for ${this.platform}`)
  }

  getOutputDir(root: string, target: string, _isDev: boolean): string {
    return join(root, globalWorkspacePath, target)
  }

  /**
   * Check if platform should use temporary directory
   */
  protected shouldUseTempDir(_target: string): boolean {
    return false
  }

  /**
   * Get temporary directory path
   */
  protected getTempDir(root: string, target: string): string {
    return join(root, globalTempDir, target)
  }
}

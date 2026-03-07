/**
 * Mobile (iOS/Android) launch strategy
 * Handles launching mobile apps via Capacitor
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseLaunchStrategy, type LaunchContext } from '../LaunchFlow.js'
import { vite } from '../../globals.js'
import { BuildError } from '../../errors.js'
import * as mobile from '../../mobile/index.js'
import { LaunchOutput } from '../../types.js'

const logger = createLogger('MobileLaunchStrategy')

/**
 * Mobile launch strategy for iOS and Android
 */
export class MobileLaunchStrategy extends BaseLaunchStrategy {
  readonly platform: string
  private server: any = null

  constructor(platform: 'ios' | 'android') {
    super()
    this.platform = platform
  }

  canHandle(target: string): boolean {
    return target === this.platform
  }

  async prepare(context: LaunchContext): Promise<void> {
    const { config } = context
    const { root, outDir: configOutDir } = config

    // Resolve output directory
    if (configOutDir) {
      context.outDir = configOutDir
    } else {
      const { globalWorkspacePath } = await import('../../globals.js')
      context.outDir = join(root, globalWorkspacePath, context.target)
    }

    // Verify output directory exists
    if (!existsSync(context.outDir)) {
      throw new BuildError(
        'Output directory not found',
        `The expected output directory does not exist: ${context.outDir}. Run build command first.`
      )
    }

    logger.debug(`${this.platform} launch prepared`, { outDir: context.outDir })
  }

  async launch(context: LaunchContext): Promise<LaunchOutput> {
    const { outDir, target, config } = context
    const { root } = config

    const isHeadless = process.env.__COMMONERS_TESTING
      || process.env.CI === 'true'
      || process.env.COMMONERS_HEADLESS === 'true'

    if (isHeadless) {
      // Serve web assets for testing/CI via Vite preview
      const __vite = await vite
      this.server = await __vite.preview({
        build: { outDir },
        preview: { open: false },
      })
      const port = this.server.config.preview.port
      const url = `http://localhost:${port}`

      logger.info(`${this.platform} app served for testing`, { url })
      context.hooks.emit({ type: 'launch:ready', url, server: this.server })
      return { url }
    }

    logger.info(`Launching ${this.platform} app`, { outDir })

    // Launch mobile app (opens in native IDE/simulator)
    // Note: Capacitor commands must run from project root, not outDir
    await mobile.launch(target as 'ios' | 'android', root)

    logger.info(`${this.platform} app launched in native environment`)

    // Emit ready event
    logger.debug('Emitting launch:ready', { platform: this.platform, outDir })
    context.hooks.emit({ type: 'launch:ready' })

    return { url: null }
  }

  async cleanup(_context: LaunchContext): Promise<void> {
    if (this.server) {
      await this.server.close()
      this.server = null
    }
  }
}

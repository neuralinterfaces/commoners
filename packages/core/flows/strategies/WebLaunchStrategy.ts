/**
 * Web/PWA launch strategy
 * Handles launching web apps with Vite dev server
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseLaunchStrategy, type LaunchContext } from '../LaunchFlow.js'
import { vite } from '../../globals.js'
import { BuildError } from '../../errors.js'
import { LaunchOutput } from '../../types.js'

const logger = createLogger('WebLaunchStrategy')

type ViteServerOptions = import('vite').ServerOptions

/**
 * Web/PWA launch strategy
 */
export class WebLaunchStrategy extends BaseLaunchStrategy {
  readonly platform = 'web'
  private server: any = null

  canHandle(target: string): boolean {
    // Handle 'web', 'pwa', or any non-desktop/mobile target
    return (
      target === 'web' ||
      target === 'pwa' ||
      (!target.includes('electron') && !target.includes('tauri') && !target.includes('ios') && !target.includes('android'))
    )
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

    logger.debug('Web launch prepared', { outDir: context.outDir })
  }

  async launch(context: LaunchContext): Promise<LaunchOutput> {
    const { outDir, port, host, config } = context
    const { public: isPublic } = config

    const __vite = await vite

    logger.info('Starting Vite preview server', { outDir, port, host })
    
    const previewConfig = {
      port,
      open: !process.env.VITEST,
      host: isPublic || host ? (host || '0.0.0.0') : undefined,
    }

    // Create Vite preview server for built artifacts (handles PWA correctly)
    this.server = await __vite.preview({
      build: {
        outDir
      },
      preview: previewConfig,
    })

    const resolvedPort = this.server.config.preview.port
    const resolvedHost = this.server.config.preview.host
    const protocol = this.server.config.preview.https ? 'https' : 'http'
    const url = `${protocol}://localhost:${resolvedPort}`
    logger.info('Vite preview server running', { url, host: resolvedHost, port: resolvedPort })
    context.hooks.emit({ type: 'launch:ready', url, server: this.server })

    return { url }
  }

  async cleanup(context: LaunchContext): Promise<void> {
    if (this.server) {
      logger.debug('Closing Vite dev server')
      await this.server.close()
      this.server = null
    }
  }
}

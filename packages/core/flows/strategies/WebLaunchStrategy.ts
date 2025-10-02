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
      (!target.includes('electron') && !target.includes('ios') && !target.includes('android'))
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

  async launch(context: LaunchContext): Promise<void> {
    const { outDir, port, host, config } = context
    const { public: isPublic } = config

    logger.info('Starting Vite dev server', { outDir, port, host })

    const __vite = await vite

    const serverConfig: ViteServerOptions = {
      port,
      open: !process.env.VITEST,
    }

    if (isPublic || host) {
      serverConfig.host = host || '0.0.0.0'
    }

    // Create Vite server
    this.server = await __vite.createServer({
      configFile: false,
      root: outDir,
      server: serverConfig,
    })

    await this.server.listen()

    // Get server info
    const { port: resolvedPort, host: resolvedHost } = this.server.config.server
    const protocol = this.server.config.server.https ? 'https' : 'http'
    const url = `${protocol}://localhost:${resolvedPort}`

    logger.info('Vite dev server running', { url, host: resolvedHost, port: resolvedPort })

    // Emit ready event with server info
    logger.debug('Emitting launch:ready', { url, hasServer: !!this.server })
    context.hooks.emit({
      type: 'launch:ready',
      url,
      server: this.server,
    })
  }

  async cleanup(context: LaunchContext): Promise<void> {
    if (this.server) {
      logger.debug('Closing Vite dev server')
      await this.server.close()
      this.server = null
    }
  }
}

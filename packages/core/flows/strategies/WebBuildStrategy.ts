/**
 * Web/PWA build strategy
 * Handles standard web and progressive web app builds
 */

import { createLogger } from '../../utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'

const logger = createLogger('WebBuildStrategy')

/**
 * Web/PWA build strategy
 * Simple strategy that relies on Vite for the entire build
 */
export class WebBuildStrategy extends BaseBuildStrategy {
  readonly platform = 'web'

  canHandle(target: string): boolean {
    // Handle 'web', 'pwa', or any non-desktop/mobile target
    return (
      target === 'web' ||
      target === 'pwa' ||
      (!target.includes('electron') && !target.includes('ios') && !target.includes('android'))
    )
  }

  async prepare(context: BuildContext): Promise<void> {
    await super.prepare(context)
    logger.debug('Web build environment prepared')
  }

  async build(context: BuildContext): Promise<void> {
    // Web builds are handled entirely by Vite in the base flow
    // No additional packaging required
    logger.debug('Web build completed (Vite handles all assets)')
  }

  async finalize(context: BuildContext): Promise<void> {
    const { outDir } = context
    logger.info('Web build ready for deployment', { outDir })
  }
}

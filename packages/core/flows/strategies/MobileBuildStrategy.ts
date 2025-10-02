/**
 * Mobile (iOS/Android) build strategy using Capacitor
 */

import { join } from 'node:path'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'
import { DIR_MOBILE } from '../../constants.js'
import { globalTempDir } from '../../globals.js'
import * as mobile from '../../mobile/index.js'

const logger = createLogger('MobileBuildStrategy')

/**
 * Mobile build strategy for iOS and Android targets
 */
export class MobileBuildStrategy extends BaseBuildStrategy {
  readonly platform: string

  constructor(platform: 'ios' | 'android') {
    super()
    this.platform = platform
  }

  canHandle(target: string): boolean {
    return target === this.platform
  }

  protected shouldUseTempDir(target: string): boolean {
    return true // Mobile builds use temporary directories
  }

  protected getTempDir(root: string, target: string): string {
    return join(root, globalTempDir, DIR_MOBILE)
  }

  async prepare(context: BuildContext): Promise<void> {
    await super.prepare(context)

    const { resolvedConfig, __outDir } = context

    logger.info(`Preparing ${this.platform} build`, { outDir: __outDir })

    // Run Capacitor prebuild
    const configCopy = { ...resolvedConfig, target: context.target, outDir: __outDir }
    await mobile.prebuild(configCopy)

    logger.debug(`${this.platform} prebuild completed`)
  }

  async build(context: BuildContext): Promise<void> {
    const { resolvedConfig, __outDir, target } = context

    logger.info(`Building ${this.platform} app`)

    logger.debug('Emitting build:mobile:start', { platform: this.platform, target })
    context.hooks.emit({ type: 'build:mobile:start', mobileTarget: this.platform })

    const mobileOpts = { target: target as 'ios' | 'android', outDir: __outDir }

    // Initialize Capacitor
    await mobile.init(mobileOpts, resolvedConfig)

    // Open in native IDE
    await mobile.open(mobileOpts, resolvedConfig)

    logger.info(`${this.platform} project ready`, { message: `Open in Xcode/Android Studio to build` })
  }

  async finalize(context: BuildContext): Promise<void> {
    logger.debug(`${this.platform} build finalized`)
  }
}

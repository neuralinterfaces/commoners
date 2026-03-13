/**
 * Tauri mobile launch strategy for iOS and Android
 * Launches previously-built Tauri mobile apps via `tauri ios dev` / `tauri android dev`
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseLaunchStrategy, type LaunchContext } from '../LaunchFlow.js'
import { TARGET_IOS_TAURI, TARGET_ANDROID_TAURI } from '../../constants.js'
import { BuildError } from '../../errors.js'
import type { LaunchOutput } from '../../types.js'

const logger = createLogger('TauriMobileLaunchStrategy')

export class TauriMobileLaunchStrategy extends BaseLaunchStrategy {
  readonly platform: string
  private mobileTarget: 'ios' | 'android'

  constructor(mobileTarget: 'ios' | 'android') {
    super()
    this.mobileTarget = mobileTarget
    this.platform = `${mobileTarget}-tauri`
  }

  canHandle(target: string): boolean {
    return target === (this.mobileTarget === 'ios' ? TARGET_IOS_TAURI : TARGET_ANDROID_TAURI)
  }

  async prepare(context: LaunchContext): Promise<void> {
    const { config } = context
    const { root, outDir: configOutDir } = config

    if (configOutDir) {
      context.outDir = configOutDir
    } else {
      const { globalWorkspacePath } = await import('../../globals.js')
      context.outDir = join(root, globalWorkspacePath, context.target)
    }

    if (!existsSync(context.outDir)) {
      throw new BuildError(
        'Output directory not found',
        `The expected output directory does not exist: ${context.outDir}. Run build command first.`
      )
    }

    logger.debug(`Tauri ${this.mobileTarget} launch prepared`, { outDir: context.outDir })
  }

  async launch(context: LaunchContext): Promise<LaunchOutput> {
    const { outDir } = context

    logger.info(`Launching Tauri ${this.mobileTarget} app`, { outDir })

    const isHeadless = process.env.CI === 'true' || process.env.COMMONERS_HEADLESS === 'true'

    if (isHeadless) {
      logger.info(`Tauri ${this.mobileTarget} launch skipped (headless mode)`)
      context.hooks.emit({ type: 'launch:ready' })
      return { url: null }
    }

    try {
      execSync(`npx tauri ${this.mobileTarget} dev`, {
        cwd: outDir,
        stdio: 'inherit',
        env: { ...process.env },
        timeout: 600000,
      })
    } catch (e) {
      logger.warn(`Tauri ${this.mobileTarget} dev exited: ${(e as Error).message}`)
    }

    context.hooks.emit({ type: 'launch:ready' })
    return { url: null }
  }
}

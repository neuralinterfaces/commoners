/**
 * Electron-builder hook chaining utilities
 * Allows combining multiple hooks into a single hook function
 */

import { createLogger } from '../logger.js'

const logger = createLogger('asar-integrity')

/**
 * Generic hook chainer that works for any electron-builder hook
 *
 * This allows you to chain multiple hook functions together, including:
 * - Existing hooks (from config or other sources)
 * - New hook functions to add
 *
 * Handles both function and string-based hooks (string = path to script file)
 *
 * @param hookName - Name of the hook for logging purposes
 * @returns Function that chains existing and new hooks
 */
function createHookChainer(hookName: string) {
  return function (
    existing: ((ctx: any) => any) | string | undefined,
    ...fns: Array<(ctx: any) => any | Promise<any>>
  ) {
    return async (ctx: any) => {
      // First, run the existing hook if it exists
      if (existing) {
        try {
          if (typeof existing === 'string') {
            // Load and execute the script file
            const scriptPath = existing
            const { createRequire } = await import('module').then(
              (mod: any) => mod.default || mod
            )
            const require = createRequire(import.meta.url || __filename)

            // Try to require the script
            const scriptModule = require(scriptPath)

            // Handle different export patterns
            const hookFunction = scriptModule.default || scriptModule

            if (typeof hookFunction === 'function') {
              await hookFunction(ctx)
              logger.info(`Executed string-based ${hookName} hook: ${scriptPath}`)
            } else {
              logger.warn(`String-based ${hookName} hook at "${scriptPath}" did not export a function`)
            }
          } else if (typeof existing === 'function') {
            await existing(ctx)
          }
        } catch (e: any) {
          logger.error(`Existing ${hookName} hook failed: ${e.message}`)
          throw e
        }
      }

      // Then run all the new functions
      for (const fn of fns) {
        try {
          await fn(ctx)
        } catch (e: any) {
          logger.error(`${hookName} hook failed: ${e.message}`)
          throw e
        }
      }
    }
  }
}

/**
 * Chain multiple `afterPack` hooks safely
 *
 * Example:
 * ```typescript
 * buildConfig.afterPack = chainAfterPack(
 *   existingAfterPack,
 *   customHook1,
 *   customHook2
 * )
 * ```
 */
export const chainAfterPack = createHookChainer('afterPack')

/**
 * Chain multiple `afterSign` hooks safely
 *
 * Example:
 * ```typescript
 * buildConfig.afterSign = chainAfterSign(
 *   existingAfterSign,
 *   customHook1,
 *   customHook2
 * )
 * ```
 */
export const chainAfterSign = createHookChainer('afterSign')

/**
 * Chain multiple `artifactBuildCompleted` hooks safely
 *
 * Example:
 * ```typescript
 * buildConfig.artifactBuildCompleted = chainArtifactBuildCompleted(
 *   existingHook,
 *   customHook1,
 *   customHook2
 * )
 * ```
 */
export const chainArtifactBuildCompleted = createHookChainer('artifactBuildCompleted')

/**
 * Chain multiple `beforeBuild` hooks safely
 *
 * Example:
 * ```typescript
 * buildConfig.beforeBuild = chainBeforeBuild(
 *   existingBeforeBuild,
 *   customHook1,
 *   customHook2
 * )
 * ```
 */
export const chainBeforeBuild = createHookChainer('beforeBuild')

/**
 * Chain multiple `afterAllArtifactBuild` hooks safely
 *
 * Example:
 * ```typescript
 * buildConfig.afterAllArtifactBuild = chainAfterAllArtifactBuild(
 *   existingHook,
 *   customHook1,
 *   customHook2
 * )
 * ```
 */
export const chainAfterAllArtifactBuild = createHookChainer('afterAllArtifactBuild')

/**
 * Build and launch flow orchestrators with platform strategies
 * Uses Strategy and Template Method patterns for extensibility
 */

// Build flow exports
export { BuildFlow, BaseBuildStrategy } from './BuildFlow.js'
export type { BuildStrategy, BuildContext } from './BuildFlow.js'

// Launch flow exports
export { LaunchFlow, BaseLaunchStrategy } from './LaunchFlow.js'
export type { LaunchStrategy, LaunchContext } from './LaunchFlow.js'

// Build strategy exports
export { ElectronBuildStrategy } from './strategies/ElectronBuildStrategy.js'
export { TauriBuildStrategy } from './strategies/TauriBuildStrategy.js'
export { MobileBuildStrategy } from './strategies/MobileBuildStrategy.js'
export { WebBuildStrategy } from './strategies/WebBuildStrategy.js'

// Launch strategy exports
export { ElectronLaunchStrategy } from './strategies/ElectronLaunchStrategy.js'
export { TauriLaunchStrategy } from './strategies/TauriLaunchStrategy.js'
export { MobileLaunchStrategy } from './strategies/MobileLaunchStrategy.js'
export { WebLaunchStrategy } from './strategies/WebLaunchStrategy.js'

// Re-export for convenience
import { BuildFlow } from './BuildFlow.js'
import { LaunchFlow } from './LaunchFlow.js'
import { ElectronBuildStrategy } from './strategies/ElectronBuildStrategy.js'
import { TauriBuildStrategy } from './strategies/TauriBuildStrategy.js'
import { MobileBuildStrategy } from './strategies/MobileBuildStrategy.js'
import { WebBuildStrategy } from './strategies/WebBuildStrategy.js'
import { ElectronLaunchStrategy } from './strategies/ElectronLaunchStrategy.js'
import { TauriLaunchStrategy } from './strategies/TauriLaunchStrategy.js'
import { MobileLaunchStrategy } from './strategies/MobileLaunchStrategy.js'
import { WebLaunchStrategy } from './strategies/WebLaunchStrategy.js'

/**
 * Create a fully configured build flow with all platform strategies
 */
export function createBuildFlow(): BuildFlow {
  const flow = new BuildFlow()

  // Register all platform strategies
  flow.registerStrategy(new ElectronBuildStrategy())
  flow.registerStrategy(new TauriBuildStrategy())
  flow.registerStrategy(new MobileBuildStrategy('ios'))
  flow.registerStrategy(new MobileBuildStrategy('android'))
  flow.registerStrategy(new WebBuildStrategy())

  return flow
}

/**
 * Create a fully configured launch flow with all platform strategies
 */
export function createLaunchFlow(): LaunchFlow {
  const flow = new LaunchFlow()

  // Register all platform strategies
  flow.registerStrategy(new ElectronLaunchStrategy())
  flow.registerStrategy(new TauriLaunchStrategy())
  flow.registerStrategy(new MobileLaunchStrategy('ios'))
  flow.registerStrategy(new MobileLaunchStrategy('android'))
  flow.registerStrategy(new WebLaunchStrategy())

  return flow
}

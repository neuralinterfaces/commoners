/**
 * Electron-specific launch strategy
 * Handles launching built Electron apps
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { cpus } from 'node:os'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseLaunchStrategy, type LaunchContext } from '../LaunchFlow.js'
import { TARGET_ELECTRON } from '../../constants.js'
import { PLATFORM } from '../../globals.js'
import { spawnProcess } from '../../utils/processes.js'
import { BuildError } from '../../errors.js'

const logger = createLogger('ElectronLaunchStrategy')

/**
 * Find file with matching extensions in directory
 */
function matchFile(directory: string, extensions: string[]): string | null {
  if (!existsSync(directory)) return null
  return (
    readdirSync(directory).find((file) => {
      const fileExtension = extname(file)
      return extensions.some((ext) => fileExtension === ext)
    }) || null
  )
}

/**
 * Get platform-specific Electron executable path
 */
function getElectronExecutable(outDir: string): string | null {
  let baseDir = ''
  let filename: string | null = null

  const platform = {
    mac: PLATFORM === 'mac',
    windows: PLATFORM === 'windows',
    linux: PLATFORM === 'linux',
  }

  if (platform.mac) {
    const isMx = /Apple\sM\d+/.test(cpus()[0].model)
    baseDir = join(outDir, `${PLATFORM}${isMx ? '-arm64' : ''}`)
    filename = matchFile(baseDir, ['.app'])
  } else if (platform.windows) {
    baseDir = join(outDir, `win-unpacked`)
    filename = matchFile(baseDir, ['.exe'])
  } else if (platform.linux) {
    baseDir = join(outDir, `linux-unpacked`)
    filename = matchFile(outDir, ['.AppImage', '.deb', '.rpm', '.snap'])
    if (filename) {
      baseDir = outDir
    } else {
      baseDir = join(outDir, `linux-unpacked`)
      filename = matchFile(baseDir, [''])
    }
  }

  const fullPath = filename ? join(baseDir, filename) : null
  if (!fullPath || !existsSync(fullPath)) return null
  return fullPath
}

/**
 * Electron launch strategy
 */
export class ElectronLaunchStrategy extends BaseLaunchStrategy {
  readonly platform = 'electron'

  canHandle(target: string): boolean {
    return target === TARGET_ELECTRON || target === 'electron'
  }

  async prepare(context: LaunchContext): Promise<void> {
    const { resolvedConfig } = context
    const { root, outDir: configOutDir } = resolvedConfig

    // Resolve output directory
    if (configOutDir) {
      context.outDir = configOutDir
    } else {
      const { globalWorkspacePath } = await import('../../globals.js')
      context.outDir = join(root, globalWorkspacePath, context.target)
    }

    logger.debug('Electron launch prepared', { outDir: context.outDir })
  }

  async launch(context: LaunchContext): Promise<void> {
    const { outDir, hooks } = context

    // Verify output directory exists
    if (!existsSync(outDir)) {
      throw new BuildError(
        'Output directory not found',
        `The expected output directory does not exist: ${outDir}. Run build command first.`
      )
    }

    // Find platform-specific executable
    const fullPath = getElectronExecutable(outDir)

    if (!fullPath) {
      throw new BuildError(
        'Platform executable not found',
        `This application has not been built for ${PLATFORM} yet. Build output directory: ${outDir}`
      )
    }

    logger.info('Launching Electron app', { path: fullPath, platform: PLATFORM })

    // Build launch command based on platform
    let runExecutableCommand = 'open' // Default to macOS command
    const resolvedArgs = [`"${fullPath}"`] // The path to the executable file
    const userArgs = new Set<string>() // User-provided arguments

    // Set the appropriate command based on the platform
    if (PLATFORM === 'windows' || PLATFORM === 'linux') {
      runExecutableCommand = resolvedArgs.shift()! // Run executable directly
    }
    if (PLATFORM === 'linux') {
      userArgs.add('--no-sandbox') // Ensure No Sandbox
    }
    if (PLATFORM === 'mac' && userArgs.size) {
      resolvedArgs.push('--args') // macOS-specific flag to pass additional arguments
    }
    resolvedArgs.push(...userArgs) // Add any additional arguments

    // Launch the Electron app
    await spawnProcess(
      runExecutableCommand,
      resolvedArgs,
      { env: process.env, label: 'commoners-electron-launcher' },
      hooks
    )

    logger.info('Electron app launched successfully')
  }
}

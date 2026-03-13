/**
 * Tauri-specific launch strategy
 * Handles launching built Tauri apps
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseLaunchStrategy, type LaunchContext } from '../LaunchFlow.js'
import { TARGET_TAURI } from '../../constants.js'
import { PLATFORM } from '../../globals.js'
import { BuildError } from '../../errors.js'
import type { LaunchOutput } from '../../types.js'

const logger = createLogger('TauriLaunchStrategy')

/**
 * Find the platform-specific Tauri executable in the bundle output directory
 *
 * Tauri v2 bundle structure:
 *   macOS:   <outDir>/macos/<ProductName>.app
 *   Windows: <outDir>/nsis/<ProductName>_<ver>_x64-setup.exe
 *   Linux:   <outDir>/appimage/<name>_<ver>_amd64.AppImage
 */
function findTauriExecutable(outDir: string): string | null {
  if (PLATFORM === 'mac') {
    const macosDir = join(outDir, 'macos')
    if (!existsSync(macosDir)) return null
    const app = readdirSync(macosDir).find(f => f.endsWith('.app'))
    if (!app) return null
    const macOSBinDir = join(macosDir, app, 'Contents', 'MacOS')
    if (!existsSync(macOSBinDir)) return null
    const binName = readdirSync(macOSBinDir)[0]
    return binName ? join(macOSBinDir, binName) : null
  }

  if (PLATFORM === 'windows') {
    // Check nsis first, then msi
    for (const [dir, ext] of [['nsis', '.exe'], ['msi', '.msi']] as const) {
      const bundleDir = join(outDir, dir)
      if (!existsSync(bundleDir)) continue
      const file = readdirSync(bundleDir).find(f => f.endsWith(ext))
      if (file) return join(bundleDir, file)
    }
    return null
  }

  if (PLATFORM === 'linux') {
    // Check appimage first, then deb
    for (const [dir, ext] of [['appimage', '.AppImage'], ['deb', '.deb']] as const) {
      const bundleDir = join(outDir, dir)
      if (!existsSync(bundleDir)) continue
      const file = readdirSync(bundleDir).find(f => f.endsWith(ext))
      if (file) return join(bundleDir, file)
    }
    return null
  }

  return null
}

/**
 * Tauri launch strategy
 */
export class TauriLaunchStrategy extends BaseLaunchStrategy {
  readonly platform = 'tauri'

  canHandle(target: string): boolean {
    return target === TARGET_TAURI
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

    logger.debug('Tauri launch prepared', { outDir: context.outDir })
  }

  async launch(context: LaunchContext): Promise<LaunchOutput> {
    const { outDir } = context

    if (!existsSync(outDir)) {
      throw new BuildError(
        'Output directory not found',
        `The expected output directory does not exist: ${outDir}. Run 'commoners build --target tauri' first.`
      )
    }

    const executablePath = findTauriExecutable(outDir)

    if (!executablePath) {
      throw new BuildError(
        'Tauri executable not found',
        `No built Tauri application found in: ${outDir}. Build first with 'commoners build --target tauri'.`
      )
    }

    logger.info('Launching Tauri app', { path: executablePath, platform: PLATFORM })

    const proc = spawn(executablePath, [], {
      cwd: context.root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    proc.stdout?.on('data', data => {
      logger.debug(`[TauriLaunch:stdout] ${data.toString().trim()}`)
    })

    proc.stderr?.on('data', data => {
      logger.debug(`[TauriLaunch:stderr] ${data.toString().trim()}`)
    })

    proc.on('error', err => {
      logger.error(`Spawn error: ${err.message}`)
    })

    proc.on('exit', (code, signal) => {
      logger.debug(`Process exited: code=${code}, signal=${signal}`)
    })

    logger.info('Tauri app launched', { pid: proc.pid })
    return {}
  }
}

// Exported for testing
export { findTauriExecutable }

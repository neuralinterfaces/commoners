/**
 * Electron-specific launch strategy
 * Handles launching built Electron apps
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { cpus } from 'node:os'
import { spawn } from 'node:child_process'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseLaunchStrategy, type LaunchContext } from '../LaunchFlow.js'
import { TARGET_ELECTRON } from '../../constants.js'
import { PLATFORM } from '../../globals.js'
import { spawnProcess } from '../../utils/processes.js'
import { BuildError } from '../../errors.js'
import { LaunchOutput } from '../../types.js'

const logger = createLogger('ElectronLaunchStrategy')

/**
 * Find file with matching extensions in directory
 */
function matchFile(directory: string, extensions: string[]): string | null {
  if (!existsSync(directory)) return null
  return (
    readdirSync(directory).find(file => {
      const fileExtension = extname(file)
      return extensions.some(ext => fileExtension === ext)
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
    const { config } = context
    const { root, outDir: configOutDir } = config

    // Resolve output directory
    if (configOutDir) {
      context.outDir = configOutDir
    } else {
      const { globalWorkspacePath } = await import('../../globals.js')
      context.outDir = join(root, globalWorkspacePath, context.target)
    }

    logger.debug('Electron launch prepared', { outDir: context.outDir })
  }

  async launch(context: LaunchContext): Promise<LaunchOutput> {
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
    const resolvedArgs = [fullPath] // The path to the executable file
    const userArgs = new Set<string>() // User-provided arguments

    // Pass remote debugging port and stability flags for testing
    const rdpPort = process.env.COMMONERS_REMOTE_DEBUGGING_PORT
    if (rdpPort) {
      userArgs.add(`--remote-debugging-port=${rdpPort}`)
      userArgs.add('--remote-allow-origins=*')
    }
    if (process.env.__COMMONERS_TESTING) {
      userArgs.add('--in-process-gpu')
      userArgs.add('--disable-dev-shm-usage')
    }

    // Set the appropriate command based on the platform
    if (PLATFORM === 'windows' || PLATFORM === 'linux') {
      runExecutableCommand = resolvedArgs.shift()! // Run executable directly
    }

    if (PLATFORM === 'linux') {
      userArgs.add('--no-sandbox') // Ensure No Sandbox
    }

    // IMPORTANT: On macOS, we must directly invoke the binary inside the .app bundle
    // instead of using the `open` command. The `open` command passes CLI flags via
    // --args, but Chromium's `--remote-debugging-port` must be present during native
    // init (before the browser process forks). The `open` command delivers args too
    // late, so the CDP server never starts.
    //
    // We use `spawn` directly (not `spawnProcess`) because the binary runs
    // indefinitely as a GUI app — `spawnProcess` would block forever.
    //
    // NOTE: Packaged builds may have a splash screen plugin that creates a broken
    // CDP target (missing splash.html → empty page). The testing package closes
    // these targets via raw CDP before Playwright connects. See testing/src/index.ts.
    if (PLATFORM === 'mac' && rdpPort) {
      const macOSDir = join(fullPath, 'Contents', 'MacOS')
      const binName = readdirSync(macOSDir)[0]
      const binPath = join(macOSDir, binName)
      const allArgs = [...userArgs]

      console.error(`[ElectronLaunch] Spawning binary: ${binPath}`)
      console.error(`[ElectronLaunch] Args: ${JSON.stringify(allArgs)}`)

      const proc = spawn(binPath, allArgs, {
        cwd: context.root,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      proc.stdout?.on('data', data => {
        console.error(`[ElectronLaunch:stdout] ${data.toString().trim()}`)
      })

      proc.stderr?.on('data', data => {
        console.error(`[ElectronLaunch:stderr] ${data.toString().trim()}`)
      })

      proc.on('error', err => {
        console.error(`[ElectronLaunch] Spawn error: ${err.message}`)
      })

      proc.on('exit', (code, signal) => {
        console.error(`[ElectronLaunch] Process exited: code=${code}, signal=${signal}`)
      })

      console.error(`[ElectronLaunch] Spawned PID: ${proc.pid}`)
      return { url: null }
    }

    if (PLATFORM === 'mac' && userArgs.size) {
      resolvedArgs.push('--args') // macOS-specific flag to pass additional arguments
    }
    resolvedArgs.push(...userArgs) // Add any additional arguments

    // On Windows/Linux with remote debugging port, use spawn (fire-and-forget)
    // instead of spawnProcess, which blocks forever waiting for the GUI app to exit.
    // Same pattern as the macOS rdpPort path above.
    if (PLATFORM !== 'mac' && rdpPort) {
      console.error(`[ElectronLaunch] Spawning binary (fire-and-forget): ${runExecutableCommand}`)
      console.error(`[ElectronLaunch] Args: ${JSON.stringify(resolvedArgs)}`)

      const proc = spawn(runExecutableCommand, resolvedArgs, {
        cwd: context.root,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      proc.stdout?.on('data', data => {
        console.error(`[ElectronLaunch:stdout] ${data.toString().trim()}`)
      })

      proc.stderr?.on('data', data => {
        console.error(`[ElectronLaunch:stderr] ${data.toString().trim()}`)
      })

      proc.on('error', err => {
        console.error(`[ElectronLaunch] Spawn error: ${err.message}`)
      })

      proc.on('exit', (code, signal) => {
        console.error(`[ElectronLaunch] Process exited: code=${code}, signal=${signal}`)
      })

      console.error(`[ElectronLaunch] Spawned PID: ${proc.pid}`)
      return { url: null }
    }

    // Launch the Electron app (uses `open` on macOS, direct binary on other platforms)
    await spawnProcess(
      runExecutableCommand,
      resolvedArgs,
      { env: process.env, label: 'commoners-electron-launcher' },
      hooks
    )

    logger.info('Electron app launched successfully')

    return { url: null }
  }
}

/**
 * Node.js Single Executable Application (SEA) utilities
 *
 * Provides functions to create standalone executables using Node.js's built-in SEA feature.
 * This is a modern replacement for pkg with better compatibility and official support.
 */

import { execSync } from 'node:child_process'
import { copyFileSync, writeFileSync, existsSync, mkdirSync, rmSync, chmodSync, statSync } from 'node:fs'
import { dirname, basename, join, extname } from 'node:path'
import { PlatformError } from '../errors.js'

export type SEAConfig = {
  main: string
  output: string
  disableExperimentalSEAWarning?: boolean
  useSnapshot?: boolean
  useCodeCache?: boolean
}

export type SEABuildOptions = {
  src: string
  out: string
  platform?: NodeJS.Platform
  force?: boolean
  sign?: boolean
}

export type SEABuildResult = {
  success: boolean
  executablePath: string
  size?: number
  error?: string
}

/**
 * Create a Single Executable Application from a bundled JavaScript file
 *
 * @param options - Build options
 * @returns Build result with executable path
 */
export async function createSEA(options: SEABuildOptions): Promise<SEABuildResult> {
  const { src, out, platform = process.platform, force = false, sign = true } = options

  try {
    // Setup paths
    const outDir = dirname(out)
    const outName = basename(out, extname(out))
    const tempBundle = join(outDir, `${outName}.bundle.js`)
    const seaConfigPath = join(outDir, `${outName}.sea-config.json`)
    const seaBlobPath = join(outDir, `${outName}.sea-prep.blob`)
    const executablePath = platform === 'win32' ? `${out}.exe` : out

    // Ensure output directory exists
    mkdirSync(outDir, { recursive: true })

    // Step 1: Bundle with esbuild
    const esbuild = await import('esbuild')
    await esbuild.build({
      entryPoints: [src],
      bundle: true,
      logLevel: 'silent',
      outfile: tempBundle,
      format: 'cjs',
      platform: 'node',
      target: 'node16',
      external: ['*.node'],
    })

    // Step 2: Create SEA configuration
    const seaConfig: SEAConfig = {
      main: basename(tempBundle),
      output: basename(seaBlobPath),
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
    }

    writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2))

    // Step 3: Generate SEA blob
    const generateCmd = `node --experimental-sea-config ${basename(seaConfigPath)}`
    execSync(generateCmd, { cwd: outDir, stdio: 'pipe' })

    // Step 4: Copy Node binary
    const nodeBinary = process.execPath
    copyFileSync(nodeBinary, executablePath)

    // Step 5: Inject SEA blob (platform-specific)
    await injectSEABlob(executablePath, seaBlobPath, platform, sign)

    // Cleanup temporary files
    rmSync(tempBundle, { force: true })
    rmSync(seaConfigPath, { force: true })
    rmSync(seaBlobPath, { force: true })

    // Get executable size
    const size = existsSync(executablePath) ? statSync(executablePath).size : undefined

    return {
      success: true,
      executablePath,
      size,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? `${error.message}\nStack: ${error.stack}` : String(error)
    return {
      success: false,
      executablePath: out,
      error: `SEA build failed for ${src}: ${errorMessage}`,
    }
  }
}

/**
 * Inject the SEA blob into the Node.js binary
 *
 * @param executablePath - Path to the copied Node.js binary
 * @param blobPath - Path to the SEA blob file
 * @param platform - Target platform
 * @param sign - Whether to sign the executable (macOS only)
 */
async function injectSEABlob(
  executablePath: string,
  blobPath: string,
  platform: NodeJS.Platform,
  sign: boolean
): Promise<void> {
  const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

  if (platform === 'darwin') {
    // macOS: Remove signature, inject, and re-sign
    try {
      execSync(`codesign --remove-signature "${executablePath}"`, { stdio: 'pipe' })
    } catch {
      // Ignore if signature removal fails (might not be signed)
    }

    // Inject with macOS-specific segment name
    const injectCmd = `npx postject "${executablePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse ${sentinelFuse} --macho-segment-name NODE_SEA`
    execSync(injectCmd, { stdio: 'pipe' })

    // Re-sign with ad-hoc signature
    if (sign) {
      try {
        execSync(`codesign --sign - "${executablePath}"`, { stdio: 'pipe' })
      } catch {
        // Signing failed but continue - executable might still work
      }
    }

    // Set executable permissions
    chmodSync(executablePath, 0o755)
  } else if (platform === 'linux') {
    // Linux: Direct injection
    const injectCmd = `npx postject "${executablePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse ${sentinelFuse}`
    execSync(injectCmd, { stdio: 'pipe' })

    // Set executable permissions
    chmodSync(executablePath, 0o755)
  } else if (platform === 'win32') {
    // Windows: Direct injection
    const injectCmd = `npx postject "${executablePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse ${sentinelFuse}`
    execSync(injectCmd, { stdio: 'pipe' })
  } else {
    throw new PlatformError(
      'SEA not supported on platform',
      `Single Executable Application creation is not supported on platform: ${platform}. Supported: darwin, linux, win32`
    )
  }
}

/**
 * Check if SEA is supported on the current Node.js version
 *
 * @returns True if SEA is supported
 */
export function isSEASupported(): boolean {
  const [major] = process.versions.node.split('.').map(Number)
  return major >= 20 // SEA is stable in Node.js 20+
}

/**
 * Get the estimated size of a SEA executable
 *
 * @param bundleSize - Size of the bundled JavaScript
 * @returns Estimated executable size
 */
export function estimateSEASize(bundleSize: number): number {
  const nodeBinarySize = statSync(process.execPath).size
  return nodeBinarySize + bundleSize
}

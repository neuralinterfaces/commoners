/**
 * Tauri-specific build strategy
 * Generates a src-tauri/ project and invokes `tauri build`
 */

import { join, dirname, isAbsolute } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'
import { TARGET_DESKTOP_TAURI, DIR_TAURI } from '../../constants.js'
import { globalTempDir } from '../../globals.js'
import { DependencyError, BuildError } from '../../errors.js'
import { getIcon } from '../../assets/utils/icons.js'
import { getServices } from '../../utils/extensions.js'
import {
  generateCargoToml,
  generateMainRs,
  generateTauriConf,
  generateCapabilities,
} from './tauri-templates.js'

const logger = createLogger('TauriBuildStrategy')

/**
 * Detect the Rust host triple (e.g. x86_64-apple-darwin, aarch64-apple-darwin)
 */
export function detectHostTriple(): string {
  const versionInfo = execSync('rustc -vV', { encoding: 'utf-8' })
  const hostLine = versionInfo.split('\n').find(l => l.startsWith('host:'))
  return hostLine ? hostLine.split(':')[1].trim() : ''
}

/**
 * Tauri build strategy implementation
 */
export class TauriBuildStrategy extends BaseBuildStrategy {
  readonly platform = 'tauri'
  private hostTriple = ''

  canHandle(target: string): boolean {
    return target === TARGET_DESKTOP_TAURI
  }

  protected shouldUseTempDir(): boolean {
    return true
  }

  protected getTempDir(root: string): string {
    return join(root, globalTempDir, DIR_TAURI, 'dist')
  }

  async prepare(context: BuildContext): Promise<void> {
    await super.prepare(context)

    // Verify Rust toolchain
    try {
      execSync('rustc --version', { stdio: 'pipe' })
    } catch {
      throw new DependencyError(
        'Rust toolchain not found',
        'Install Rust via https://rustup.rs/ and ensure rustc and cargo are on PATH.'
      )
    }

    // Verify @tauri-apps/cli
    try {
      execSync('npx tauri --version', { stdio: 'pipe', timeout: 30000 })
    } catch {
      throw new DependencyError(
        '@tauri-apps/cli not found',
        'Install the Tauri CLI: npm install -D @tauri-apps/cli'
      )
    }

    // Detect host triple
    try {
      this.hostTriple = detectHostTriple()
    } catch {
      this.hostTriple = ''
    }

    if (!this.hostTriple) {
      throw new BuildError(
        'Could not detect Rust host triple',
        'Run `rustc -vV` to verify your Rust installation.'
      )
    }

    logger.info('Tauri build environment prepared', { hostTriple: this.hostTriple })
  }

  async build(context: BuildContext): Promise<void> {
    const { config, outDir, stagingDir } = context
    const { name, appId, version } = config
    const tauriConfig = (config as any).tauri || {}

    logger.info('Starting Tauri packaging', { name, appId })
    context.hooks.emit({ type: 'build:tauri:start' } as any)

    // stagingDir is the Vite output dir (e.g. .commoners/.tmp/tauri/dist/)
    // src-tauri/ goes in the parent so it's not inside frontendDist
    const tauriRoot = dirname(stagingDir)
    const srcTauriDir = join(tauriRoot, 'src-tauri')
    const srcDir = join(srcTauriDir, 'src')
    const binDir = join(srcTauriDir, 'binaries')
    const capDir = join(srcTauriDir, 'capabilities')

    // Create directory structure
    for (const dir of [srcDir, binDir, capDir]) {
      mkdirSync(dir, { recursive: true })
    }

    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

    // Generate Cargo.toml
    writeFileSync(join(srcTauriDir, 'Cargo.toml'), generateCargoToml(sanitizedName))

    // Generate src/main.rs
    writeFileSync(join(srcDir, 'main.rs'), generateMainRs())

    // Generate build.rs
    writeFileSync(join(srcTauriDir, 'build.rs'), 'fn main() {\n  tauri_build::build()\n}\n')

    // Copy compiled service binaries to src-tauri/binaries/ with target-triple naming
    const services = getServices(config.extensions)
    const externalBins: string[] = []
    const serviceIds: string[] = []

    for (const [id, service] of Object.entries(services)) {
      if (!service.filepath || !existsSync(service.filepath)) continue

      const ext = process.platform === 'win32' ? '.exe' : ''
      const targetName = `${id}-${this.hostTriple}${ext}`
      const destPath = join(binDir, targetName)
      copyFileSync(service.filepath, destPath)

      // Ensure executable permission on macOS/Linux
      if (process.platform !== 'win32') {
        chmodSync(destPath, 0o755)
      }

      // Pre-sign sidecar on macOS
      if (process.platform === 'darwin') {
        try {
          execSync(`codesign -f -s - "${destPath}"`, { stdio: 'pipe' })
          logger.debug(`Pre-signed sidecar: ${targetName}`)
        } catch (e) {
          logger.warn(`Failed to pre-sign sidecar ${targetName}: ${(e as Error).message}`)
        }
      }

      externalBins.push(`binaries/${id}`)
      serviceIds.push(id)
    }

    // Prepare icon: Tauri requires RGBA PNGs, so convert if needed
    const iconDir = join(srcTauriDir, 'icons')
    mkdirSync(iconDir, { recursive: true })
    let tauriIconPaths: string[] = []

    const rawIconSrc = getIcon(config.icon)
    if (rawIconSrc) {
      const resolvedIconPath = isAbsolute(rawIconSrc) ? rawIconSrc : join(config.root, rawIconSrc)
      if (existsSync(resolvedIconPath)) {
        const destIcon = join(iconDir, 'icon.png')
        copyFileSync(resolvedIconPath, destIcon)
        // Convert to RGBA using sips (macOS) — Tauri requires RGBA format
        if (process.platform === 'darwin') {
          try {
            execSync(`sips -s format png "${destIcon}" --out "${destIcon}"`, { stdio: 'pipe' })
          } catch { /* conversion failed, try as-is */ }
        }
        tauriIconPaths = ['icons/icon.png']
      }
    }

    // Generate tauri.conf.json
    const tauriConf = generateTauriConf({
      name,
      appId,
      version,
      icon: tauriIconPaths,
      tauriConfig,
      electronWindow: config.electron?.window,
      externalBins,
    })
    writeFileSync(join(srcTauriDir, 'tauri.conf.json'), JSON.stringify(tauriConf, null, 2))

    // Generate capabilities/default.json
    const capabilities = generateCapabilities(serviceIds)
    writeFileSync(join(capDir, 'default.json'), JSON.stringify(capabilities, null, 2))

    // Invoke tauri build
    logger.info('Running tauri build...', { cwd: tauriRoot })
    try {
      execSync('npx tauri build', {
        cwd: tauriRoot,
        stdio: 'inherit',
        env: { ...process.env },
        timeout: 600000, // 10 minute timeout
      })
    } catch {
      throw new BuildError(
        'Tauri build failed',
        'The tauri build command failed. Check the output above for details.'
      )
    }

    // Copy bundle output to final outDir
    const bundleDir = join(srcTauriDir, 'target', 'release', 'bundle')
    if (existsSync(bundleDir)) {
      const actualOutDir = isAbsolute(outDir) ? outDir : join(process.cwd(), outDir)
      mkdirSync(actualOutDir, { recursive: true })
      cpSync(bundleDir, actualOutDir, { recursive: true })
      logger.info('Tauri bundles copied to output', { outDir: actualOutDir })
    }

    context.hooks.emit({ type: 'build:tauri:complete' } as any)
    logger.info('Tauri packaging completed')
  }
}

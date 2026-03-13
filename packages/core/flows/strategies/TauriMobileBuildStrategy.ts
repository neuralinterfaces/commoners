/**
 * Tauri mobile build strategy for iOS and Android
 * Generates a src-tauri/ project and invokes `tauri ios build` or `tauri android build`
 */

import { join, isAbsolute } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'
import { TARGET_IOS_TAURI, TARGET_ANDROID_TAURI, DIR_TAURI } from '../../constants.js'
import { globalTempDir } from '../../globals.js'
import { DependencyError, BuildError } from '../../errors.js'
import { getServices } from '../../utils/extensions.js'
import {
  generateCargoToml,
  generateMainRs,
  generateTauriConf,
  generateCapabilities,
} from './tauri-templates.js'

const logger = createLogger('TauriMobileBuildStrategy')

export class TauriMobileBuildStrategy extends BaseBuildStrategy {
  readonly platform: string
  /** The bare platform name for Tauri CLI commands ('ios' | 'android') */
  private mobileTarget: 'ios' | 'android'

  constructor(mobileTarget: 'ios' | 'android') {
    super()
    this.mobileTarget = mobileTarget
    this.platform = `${mobileTarget}-tauri`
  }

  canHandle(target: string): boolean {
    return target === (this.mobileTarget === 'ios' ? TARGET_IOS_TAURI : TARGET_ANDROID_TAURI)
  }

  protected shouldUseTempDir(): boolean {
    return true
  }

  protected getTempDir(root: string): string {
    return join(root, globalTempDir, DIR_TAURI)
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

    // iOS-specific: verify Xcode
    if (this.mobileTarget === 'ios') {
      try {
        execSync('xcodebuild -version', { stdio: 'pipe' })
      } catch {
        throw new DependencyError(
          'Xcode not found',
          'Install Xcode from the App Store and run `xcode-select --install`.'
        )
      }
    }

    // Android-specific: verify Android SDK
    if (this.mobileTarget === 'android') {
      const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
      if (!androidHome) {
        throw new DependencyError(
          'Android SDK not found',
          'Set ANDROID_HOME or ANDROID_SDK_ROOT environment variable. Install Android Studio or the Android SDK command-line tools.'
        )
      }
    }

    logger.info(`Tauri ${this.mobileTarget} build environment prepared`)
  }

  async build(context: BuildContext): Promise<void> {
    const { config, outDir, __outDir } = context
    const { name, appId, version } = config
    const tauriConfig = (config as any).tauri || {}

    logger.info(`Starting Tauri ${this.mobileTarget} packaging`, { name, appId })
    context.hooks.emit({ type: 'build:mobile:start', mobileTarget: this.mobileTarget } as any)

    const srcTauriDir = join(__outDir, 'src-tauri')
    const srcDir = join(srcTauriDir, 'src')
    const capDir = join(srcTauriDir, 'capabilities')

    for (const dir of [srcDir, capDir]) {
      mkdirSync(dir, { recursive: true })
    }

    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

    // Generate Cargo.toml
    writeFileSync(join(srcTauriDir, 'Cargo.toml'), generateCargoToml(sanitizedName))

    // Generate src/main.rs (desktop entry) and src/lib.rs (mobile entry)
    writeFileSync(join(srcDir, 'main.rs'), generateMainRs())
    writeFileSync(
      join(srcDir, 'lib.rs'),
      `#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`
    )

    // Generate build.rs
    writeFileSync(join(srcTauriDir, 'build.rs'), 'fn main() {\n  tauri_build::build()\n}\n')

    // Generate tauri.conf.json (no externalBin for mobile)
    const tauriConf = generateTauriConf({
      name,
      appId,
      version,
      icon: config.icon,
      tauriConfig,
      electronWindow: config.electron?.window,
      externalBins: [],
    })
    tauriConf.bundle.targets = this.mobileTarget === 'ios' ? 'app' : 'apk'
    writeFileSync(join(srcTauriDir, 'tauri.conf.json'), JSON.stringify(tauriConf, null, 2))

    // Generate capabilities/default.json (no shell:allow-spawn on mobile)
    const capabilities = generateCapabilities([])
    writeFileSync(join(capDir, 'default.json'), JSON.stringify(capabilities, null, 2))

    // Initialize Tauri mobile platform
    logger.info(`Initializing Tauri ${this.mobileTarget}...`)
    try {
      execSync(`npx tauri ${this.mobileTarget} init`, {
        cwd: __outDir,
        stdio: 'inherit',
        env: { ...process.env },
        timeout: 120000,
      })
    } catch {
      throw new BuildError(
        `Tauri ${this.mobileTarget} init failed`,
        `Failed to initialize Tauri ${this.mobileTarget} project. Check the output above for details.`
      )
    }

    // Build for mobile platform
    logger.info(`Running tauri ${this.mobileTarget} build...`, { cwd: __outDir })
    const isHeadless = process.env.CI === 'true' || process.env.COMMONERS_HEADLESS === 'true'
    try {
      execSync(`npx tauri ${this.mobileTarget} build`, {
        cwd: __outDir,
        stdio: 'inherit',
        env: { ...process.env },
        timeout: 600000,
      })
    } catch {
      if (isHeadless) {
        logger.info(`Tauri ${this.mobileTarget} project synced (headless). Use native tooling to compile.`)
      } else {
        throw new BuildError(
          `Tauri ${this.mobileTarget} build failed`,
          `The tauri ${this.mobileTarget} build command failed. Check the output above for details.`
        )
      }
    }

    // Copy bundle output to final outDir
    const bundleDir = join(srcTauriDir, 'target')
    if (existsSync(bundleDir)) {
      const actualOutDir = isAbsolute(outDir) ? outDir : join(process.cwd(), outDir)
      mkdirSync(actualOutDir, { recursive: true })
      cpSync(bundleDir, actualOutDir, { recursive: true })
      logger.info(`Tauri ${this.mobileTarget} bundles copied to output`, { outDir: actualOutDir })
    }

    context.hooks.emit({ type: 'build:tauri:complete' } as any)
    logger.info(`Tauri ${this.mobileTarget} packaging completed`)
  }
}

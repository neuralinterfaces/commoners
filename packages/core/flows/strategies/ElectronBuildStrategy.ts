/**
 * Electron-specific build strategy
 * Handles Electron app packaging and code signing
 */

import { join, relative, isAbsolute } from 'node:path'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'
import { TARGET_DESKTOP_ELECTRON, DIR_ELECTRON } from '../../constants.js'
import { parseOptions } from '../../assets/electron/modules/config.js'

import { globalTempDir, getBuildConfig, templateDir, electronVersion } from '../../globals.js'
import { configureForDesktop } from '../../index.js'
import merge from '../../utils/merge.js'
import { lstatSync } from '../../utils/lstat.js'
import {
  getIcon,
  ELECTRON_PREFERENCE,
  ELECTRON_WINDOWS_PREFERENCE,
} from '../../assets/utils/icons.js'
import { getAssetBuildPath } from '../../utils/assets.js'
import { loadEnvironmentVariables } from '../../assets/services/env/index.js'
import path from 'node:path'
import type { WritableElectronBuilderConfig } from '../../types.js'

const logger = createLogger('ElectronBuildStrategy')

// Utility functions
const replaceAllSpecialCharacters = (str: string) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) =>
  new RegExp(str).toString().split('/').slice(1, -1).join('/')

/**
 * Electron build strategy implementation
 */
export class ElectronBuildStrategy extends BaseBuildStrategy {
  readonly platform = 'electron'

  canHandle(target: string): boolean {
    return target === TARGET_DESKTOP_ELECTRON
  }

  protected shouldUseTempDir(_target: string): boolean {
    return true // Electron builds use temporary directories
  }

  protected getTempDir(root: string, _target: string): string {
    return join(root, globalTempDir, DIR_ELECTRON)
  }

  async prepare(context: BuildContext): Promise<void> {
    await super.prepare(context)

    // Load environment variables
    const env = loadEnvironmentVariables('production', context.root)
    Object.assign(process.env, env)

    logger.debug('Electron build environment prepared', {
      env: Object.keys(env).length,
    })
  }

  async build(context: BuildContext): Promise<void> {
    const { config, root, outDir, stagingDir } = context
    const { name, appId } = config

    logger.info('Starting Electron packaging', { name, appId })

    logger.debug('Emitting build:electron:start', { name, appId })
    context.hooks.emit({ type: 'build:electron:start' })

    // Configure package.json for Electron — writes temp package.json into stagingDir
    const cwdRelativeOutDir = relative(process.cwd(), stagingDir)
    const relativeOutDir = relative(root, stagingDir)

    configureForDesktop(stagingDir, root, {
      name: name.toLowerCase().split(' ').join('-'),
      version: '0.0.0',
    })

    // Build Electron main and preload files
    const { buildElectronAssets } = await import('../../vite/plugins/electron/index.js')
    await buildElectronAssets(root, stagingDir, true, { command: 'build', mode: 'production' }, {})

    // Generate service trust manifest before packaging — sealed inside app.asar
    // via ASAR integrity. Used at runtime to OS-verify each service binary's code
    // signature before spawning. Replaces the older byte-hash manifest, which
    // could not survive code signing (signtool/codesign mutate bytes after
    // hashes were computed, causing legitimate signed binaries to be rejected).
    await this.generateServiceTrustManifest(context, stagingDir)

    // Build electron-builder configuration
    const electronBuilderConfig = await this.buildElectronConfig(
      context,
      cwdRelativeOutDir,
      relativeOutDir
    )

    // Package the app
    const { build } = await import('electron-builder')
    await build(electronBuilderConfig)

    logger.debug('Emitting build:electron:complete', { name, outDir })
    context.hooks.emit({ type: 'build:electron:complete' })

    logger.info('Electron packaging completed')
  }

  async finalize(context: BuildContext): Promise<void> {
    super.finalize(context)
    this.logger.debug('No finalization steps for electron')
  }

  /**
   * Build electron-builder configuration
   */
  private async buildElectronConfig(
    context: BuildContext,
    cwdRelativeOutDir: string,
    relativeOutDir: string
  ): Promise<any> {
    const { config, root, outDir, stagingDir } = context
    const { name, electron, appId, icon } = config

    const buildConfig = merge(
      electron.build ?? {},
      getBuildConfig()
    ) as WritableElectronBuilderConfig

    buildConfig.productName = name
    buildConfig.appId = appId

    // Disable npm rebuild to avoid dependency conflicts
    buildConfig.npmRebuild = false

    // Set output directory to final location (not temp dir)
    // This is where electron-builder will place the final packages (.app, .dmg, .zip, etc.)
    const actualOutDir = isAbsolute(outDir) ? outDir : join(process.cwd(), outDir)
    buildConfig.directories.output = actualOutDir

    // App directory is where the built files are (temp dir)
    // This way electron-builder packages the contents directly without extra nesting
    buildConfig.directories.app = relativeOutDir

    // Set files to include (everything in the app directory)
    const files = (buildConfig.files = ['**/*'])

    // Ensure platform-specific configs exist
    this.ensurePlatformConfigs(buildConfig)

    // Configure Linux
    buildConfig.linux.executableName = buildConfig.productName
    Object.assign(buildConfig.linux, {
      executableName: buildConfig.productName,
      artifactName: '${productName}-${version}.${ext}',
    })

    // Handle extra resources and assets
    const extraResources = (buildConfig.extraResources = [])
    const signIgnore = (buildConfig.mac.signIgnore = [])

    await this.configureAssets(
      context,
      cwdRelativeOutDir,
      relativeOutDir,
      files,
      extraResources,
      signIgnore
    )

    // Configure icons
    this.configureIcons(buildConfig, icon, root, stagingDir)

    // Configure paths
    this.configurePaths(buildConfig, root)

    // Enable ASAR by default
    if (buildConfig.asar === undefined) {
      buildConfig.asar = true
    }

    // Configure code signing
    this.configureCodeSigning(buildConfig, config)

    // Configure ASAR integrity
    await this.configureAsarIntegrity(buildConfig, config)

    // Set Electron version
    if (!('electronVersion' in buildConfig)) {
      buildConfig.electronVersion = electronVersion
    }

    // Build CLI options
    const electronBuilderOpts: any = {
      config: buildConfig as Record<string, any>,
    }

    if (root) {
      electronBuilderOpts.projectDir = root
    }

    const { publish } = config.build ?? {}
    if (publish) {
      electronBuilderOpts.publish = typeof publish === 'string' ? publish : 'always'
    } else {
      buildConfig.publish = null
    }

    logger.debug('Electron builder config created', {
      productName: buildConfig.productName,
      appId: buildConfig.appId,
    })

    return electronBuilderOpts
  }

  /**
   * Ensure platform-specific configurations exist
   */
  private ensurePlatformConfigs(buildConfig: WritableElectronBuilderConfig): void {
    const platforms = ['mac', 'win', 'linux']
    for (const platform of platforms) {
      if (!buildConfig[platform]) {
        buildConfig[platform] = {}
      }
    }
  }

  /**
   * Configure assets, extra resources, and sign ignore
   */
  private async configureAssets(
    context: BuildContext,
    cwdRelativeOutDir: string,
    relativeOutDir: string,
    files: string[],
    extraResources: string[],
    signIgnore: string[]
  ): Promise<void> {
    const { config, stagingDir, root, target, assets } = context
    const { getAppAssets, buildAssets } = await import('../../utils/assets.js')

    // Build app assets (config, plugins, etc.)
    const appAssetCollection = await getAppAssets(config, false, stagingDir)
    const appAssets = await buildAssets(appAssetCollection, { outDir: stagingDir, root, target })

    const allAssets = [...appAssets, ...assets]

    const resolveFileLocation = (file: string) => {
      const relPath = relative(cwdRelativeOutDir, file)
      return join(relativeOutDir, relPath)
    }

    allAssets.forEach(
      ({ file, extraResource, sign, isDirectory = lstatSync(file).isDirectory() }) => {
        const location = resolveFileLocation(file)

        if (extraResource) {
          const glob = isDirectory ? join(location, '**') : location
          extraResources.push(glob)
          files.push(`!${glob}`)
        }

        // Ignore Code Signing for Certain Files
        if (sign === false) {
          signIgnore.push(
            convertToBaseRegexString(`${replaceAllSpecialCharacters(location)}(/.*)?$`)
          )
        }
      }
    )
  }

  /**
   * Configure platform-specific icons
   */
  private configureIcons(
    buildConfig: WritableElectronBuilderConfig,
    icon: any,
    root: string,
    outDir: string
  ): void {
    const preferredMacIcon = getIcon(icon, { preferredFormats: ELECTRON_PREFERENCE })
    const preferredWinIcon = getIcon(icon, {
      preferredFormats: ELECTRON_WINDOWS_PREFERENCE,
    })

    const resolveIconPath = (iconPath: string) => {
      const resolved = isAbsolute(iconPath) ? iconPath : join(root, iconPath)
      return resolved ? getAssetBuildPath(resolved, outDir) : resolved
    }

    if (preferredMacIcon) {
      buildConfig.mac.icon = resolveIconPath(preferredMacIcon)
    }
    if (preferredWinIcon) {
      buildConfig.win.icon = resolveIconPath(preferredWinIcon)
    }
  }

  /**
   * Configure absolute paths for Electron build
   */
  private configurePaths(buildConfig: WritableElectronBuilderConfig, root: string): void {
    const electronTemplateDir = path.join(templateDir, DIR_ELECTRON)

    buildConfig.directories.buildResources = path.join(
      electronTemplateDir,
      buildConfig.directories.buildResources
    )

    const pathOptions: Record<string, string | undefined> = {
      afterSign: path.join(electronTemplateDir, 'build/notarize.cjs'),
      artifactBuildCompleted: undefined,
      sign: undefined,
    }

    for (const key in pathOptions) {
      if (!buildConfig[key]) {
        const defaultValue = pathOptions[key]
        if (defaultValue !== undefined) {
          buildConfig[key] = defaultValue
        }
      } else if (typeof buildConfig[key] === 'string' && !isAbsolute(buildConfig[key] as string)) {
        buildConfig[key] = path.join(root, buildConfig[key] as string)
      }
    }

    buildConfig.mac.entitlementsInherit = path.join(
      electronTemplateDir,
      buildConfig.mac.entitlementsInherit
    )
  }

  private willSign(config: any): boolean {
    const { publish, sign } = config.build ?? {}
    return Boolean(publish || sign)
  }

  /**
   * Configure code signing settings
   */
  private configureCodeSigning(buildConfig: WritableElectronBuilderConfig, config: any): void {
    const toSign = this.willSign(config)
    if (!toSign) {
      // Disable code signing for Mac
      buildConfig.mac.identity = null

      // Disable signing on Windows
      buildConfig.win.forceCodeSigning = false

      // Remove environment variables that may interfere with signing
      const envVariablePrefixes = ['CSC_', 'WIN_CSC_']
      const matchedEnvVariables = Object.keys(process.env).filter(key =>
        envVariablePrefixes.some(prefix => key.startsWith(prefix))
      )
      matchedEnvVariables.forEach(key => delete process.env[key])

      logger.debug('Code signing disabled')
    } else {
      logger.debug('Code signing enabled')

      // Platform-specific certificate validation
      if (process.platform === 'win32') {
        const hasCert = process.env.WIN_CSC_LINK || process.env.CSC_LINK
        if (!hasCert) {
          throw new Error(
            'Windows code signing requested but no certificate found. ' +
              'Set WIN_CSC_LINK (or CSC_LINK) to the path or URL of your .pfx certificate file. ' +
              'To build without signing, omit --sign and --publish flags.'
          )
        }

        if (!process.env.WIN_CSC_KEY_PASSWORD) {
          logger.warn(
            'WIN_CSC_KEY_PASSWORD is not set — electron-builder will prompt for it or fail if non-interactive'
          )
        }

        // Ensure electron-builder errors instead of silently producing unsigned builds
        buildConfig.win.forceCodeSigning = true
      }

      if (process.platform === 'darwin') {
        const missingMacVars = ['APPLE_ID', 'APPLE_ID_PASSWORD', 'APPLE_TEAM_ID'].filter(
          v => !process.env[v]
        )
        const hasCSCLink = !!process.env.CSC_LINK

        if (missingMacVars.length > 0 && !hasCSCLink) {
          // No certificates — use ad-hoc signing (works locally, not distributable)
          buildConfig.mac.identity = '-'
          logger.info(
            'Using ad-hoc code signing (no Apple Developer certificates found). ' +
              'ASAR integrity will be embedded. App can run locally but cannot be distributed.'
          )
        } else if (missingMacVars.length > 0) {
          logger.warn(
            `macOS notarization may fail — missing env vars: ${missingMacVars.join(', ')}. ` +
              'Set these for successful notarization via @electron/notarize.'
          )
        }
      }
    }

    // Note: includeSubNodeModules was removed in electron-builder 26; workspace dependencies are handled automatically
  }

  /**
   * Configure ASAR integrity for secure builds
   */
  private async configureAsarIntegrity(
    buildConfig: WritableElectronBuilderConfig,
    config: any
  ): Promise<void> {
    const forceIntegrity = process.env.COMMONERS_FORCE_ASAR_INTEGRITY === 'true'
    const willSign = this.willSign(config)
    if (!willSign && !forceIntegrity) {
      logger.debug('ASAR integrity disabled since the application will not be signed')
      return
    }

    const { securitySettings } = parseOptions(config, true)

    // Check if security is completely disabled
    const { asarIntegrity } = securitySettings
    if (asarIntegrity === false) {
      logger.debug('ASAR integrity disabled by configuration')
      return
    }

    // Parse strict option from asarIntegrity setting
    const strict = typeof asarIntegrity === 'object' ? (asarIntegrity.strict ?? true) : true

    logger.debug('Configuring ASAR integrity validation', { strict })

    // Import ASAR security utilities
    const {
      makeAfterPackEmbedAsarIntegrity,
      afterPackFlipFuses,
      afterSignVerifyAsarIntegrity,
      chainAfterPack,
      chainAfterSign,
    } = await import('../../utils/asar/security.js')

    // Create the integrity embedding hook
    const embedIntegrity = makeAfterPackEmbedAsarIntegrity({ strict })

    // Chain afterPack hooks: embed integrity first, then flip fuses
    const existingAfterPack = buildConfig.afterPack as any
    buildConfig.afterPack = chainAfterPack(
      existingAfterPack,
      embedIntegrity,
      afterPackFlipFuses
    ) as any

    // Chain afterSign hook: verify ASAR hash survived code signing on macOS
    const existingAfterSign = buildConfig.afterSign as any
    buildConfig.afterSign = chainAfterSign(existingAfterSign, afterSignVerifyAsarIntegrity) as any

    logger.debug('ASAR integrity hooks configured (afterPack + afterSign)')
  }

  /**
   * Generate a service trust manifest declaring the expected code-signing publisher
   * for each executable service. Written to the build output so it's packaged into
   * the ASAR — sealed by ASAR integrity at runtime, an attacker cannot redirect the
   * trust without invalidating the asar.
   *
   * At runtime, the service launcher asks the OS to verify each binary's actual
   * code signature (Authenticode on Windows, codesign on macOS) and asserts the
   * signing identity matches the sealed expected publisher. This replaces an older
   * byte-hash design that broke on signed builds, because hashes were computed
   * before signtool/codesign mutated the binaries.
   *
   * If `electron.security.expectedPublisher` is not set in the user config, no
   * trust manifest is written and runtime verification is skipped (compatible with
   * unsigned dev builds).
   */
  private async generateServiceTrustManifest(context: BuildContext, outDir: string): Promise<void> {
    const { writeFileSync } = await import('node:fs')

    const { config } = context
    const electron = (config as any).electron
    const security = electron?.security
    const expectedPublisher: string | undefined =
      typeof security === 'object' ? security.expectedPublisher : undefined

    if (!expectedPublisher) {
      logger.debug('Service trust manifest skipped (electron.security.expectedPublisher not set)')
      return
    }

    const { serviceManifest } = config
    const trust: Record<string, { expectedPublisher: string }> = {}

    for (const [id, entry] of Object.entries(serviceManifest)) {
      if (!entry.executable || !entry.filepath) continue
      trust[id] = { expectedPublisher }
    }

    if (Object.keys(trust).length === 0) {
      logger.debug('Service trust manifest skipped (no executable services)')
      return
    }

    const manifestPath = join(outDir, 'service-trust.json')
    writeFileSync(manifestPath, JSON.stringify(trust, null, 2))
    logger.info('Service trust manifest generated', {
      services: Object.keys(trust),
      expectedPublisher,
    })
  }
}

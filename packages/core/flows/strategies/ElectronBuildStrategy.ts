/**
 * Electron-specific build strategy
 * Handles Electron app packaging and code signing
 */

import { join, relative, isAbsolute } from 'node:path'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'
import { TARGET_ELECTRON, DIR_ELECTRON } from '../../constants.js'
import { parseOptions } from '../../assets/electron/modules/config.js'

import {
  globalTempDir,
  getBuildConfig,
  templateDir,
  electronVersion,
} from '../../globals.js'
import { configureForDesktop } from '../../index.js'
import merge from '../../utils/merge.js'
import { lstatSync } from '../../utils/lstat.js'
import { getIcon, ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE } from '../../assets/utils/icons.js'
import { getAssetBuildPath } from '../../utils/assets.js'
import { loadEnvironmentVariables } from '../../assets/services/env/index.js'
import path from 'node:path'
import type { WritableElectronBuilderConfig } from '../../types.js'

const logger = createLogger('ElectronBuildStrategy')

// Utility functions
const replaceAllSpecialCharacters = (str: string) =>
  str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) =>
  new RegExp(str).toString().split('/').slice(1, -1).join('/')

/**
 * Electron build strategy implementation
 */
export class ElectronBuildStrategy extends BaseBuildStrategy {
  readonly platform = 'electron'

  canHandle(target: string): boolean {
    return target === TARGET_ELECTRON || target === 'electron'
  }

  protected shouldUseTempDir(target: string): boolean {
    return true // Electron builds use temporary directories
  }

  protected getTempDir(root: string, target: string): string {
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
    const { config, root, outDir, __outDir } = context
    const { name, appId } = config

    logger.info('Starting Electron packaging', { name, appId })

    logger.debug('Emitting build:electron:start', { name, appId })
    context.hooks.emit({ type: 'build:electron:start' })

    // Configure package.json for Electron — writes temp package.json into __outDir
    const cwdRelativeOutDir = relative(process.cwd(), __outDir)
    const relativeOutDir = relative(root, __outDir)

    configureForDesktop(__outDir, root, {
      name: name.toLowerCase().split(' ').join('-'),
      version: '0.0.0',
    })

    // Build Electron main and preload files
    const { buildElectronAssets } = await import('../../vite/plugins/electron/index.js')
    await buildElectronAssets(root, __outDir, true, { command: 'build', mode: 'production' }, {})

    // Generate service binary hash manifest before packaging
    await this.generateServiceHashManifest(context, __outDir)

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
    const { config, root, outDir, __outDir } = context
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
    this.configureIcons(buildConfig, icon, root, __outDir)

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

    const { config, __outDir, root, target, assets } = context
    const { getAppAssets, buildAssets } = await import('../../utils/assets.js')

    // Build app assets (config, plugins, etc.)
    const appAssetCollection = await getAppAssets(config, false, __outDir)
    const appAssets = await buildAssets(appAssetCollection, { outDir: __outDir, root, target })


    const allAssets = [ ...appAssets, ...assets ]

    const resolveFileLocation = (file: string) => {
      const relPath = relative(cwdRelativeOutDir, file)
      return join(relativeOutDir, relPath)
    }

    allAssets.forEach(({ file, extraResource, sign, isDirectory = lstatSync(file).isDirectory() }) => {
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
    })
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
      } else if (
        typeof buildConfig[key] === 'string' &&
        !isAbsolute(buildConfig[key] as string)
      ) {
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
  private configureCodeSigning(
    buildConfig: WritableElectronBuilderConfig,
    config: any
  ): void {

    const toSign = this.willSign(config)
    if (!toSign) {
      // Disable code signing for Mac
      buildConfig.mac.identity = null

      // Disable signing on Windows
      buildConfig.win.forceCodeSigning = false

      // Remove environment variables that may interfere with signing
      const envVariablePrefixes = ['CSC_', 'WIN_CSC_']
      const matchedEnvVariables = Object.keys(process.env).filter((key) =>
        envVariablePrefixes.some((prefix) => key.startsWith(prefix))
      )
      matchedEnvVariables.forEach((key) => delete process.env[key])

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
          (v) => !process.env[v]
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

    const willSign = this.willSign(config)
    if (!willSign) {
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
      chainAfterPack,
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

    logger.debug('ASAR integrity hooks configured')
  }

  /**
   * Generate a SHA256 hash manifest of executable service binaries.
   * Written to the build output so it's packaged into the ASAR,
   * enabling runtime integrity verification before spawning services.
   */
  private async generateServiceHashManifest(
    context: BuildContext,
    outDir: string
  ): Promise<void> {
    const { existsSync, readFileSync, writeFileSync } = await import('node:fs')
    const { extname } = await import('node:path')
    const { sha256 } = await import('../../utils/asar/hash.js')
    const { getServices } = await import('../../utils/extensions.js')

    const services = getServices(context.config.extensions)
    const hashes: Record<string, string> = {}

    for (const [id, service] of Object.entries(services)) {
      const { filepath } = service
      if (!filepath) continue

      const ext = extname(filepath)
      const isExecutable = ext === '.exe' || ext === '' || !ext
      if (!isExecutable) continue

      if (!existsSync(filepath)) continue

      const buf = readFileSync(filepath)
      hashes[id] = sha256(buf)
      logger.debug(`Service hash: ${id} -> ${hashes[id].slice(0, 12)}...`)
    }

    if (Object.keys(hashes).length > 0) {
      const manifestPath = join(outDir, 'service-hashes.json')
      writeFileSync(manifestPath, JSON.stringify(hashes, null, 2))
      logger.info('Service hash manifest generated', { services: Object.keys(hashes) })
    }
  }
}

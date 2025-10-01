// Build-In Modules
import path, { dirname, isAbsolute, join, relative, resolve } from 'node:path'

// General Internal Imports
import {
  isDesktop,
  getBuildConfig,
  globalTempDir,
  templateDir,
  isMobile,
  globalWorkspacePath,
  handleTemporaryDirectories,
  chalk,
  vite,
  electronVersion,
} from './globals.js'
import { TARGET_ELECTRON, DIR_ELECTRON, DIR_MOBILE } from './constants.js'
import {
  BuildHooks,
  ServiceBuildOptions,
  ServiceRebuildOption,
  UserConfig,
  WritableElectronBuilderConfig,
  HooksInterface,
} from './types.js'

// Internal Utilities
import { getAppAssets, getServiceAssets, buildAssets, getAssetBuildPath, getServicesToBuild } from './utils/assets.js'
import { lstatSync } from './utils/lstat.js'
import { removeDirectory } from './utils/files.js'
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from './assets/utils/icons.js'
import merge from './utils/merge.js'

// import {
//     chainAfterPack,
//     chainArtifactBuildCompleted,
//     debugAfterPack,
//     makeAfterPackEmbedAsarIntegrity,
// ASAR security features - commented out pending future implementation
// See: https://github.com/commoners/commoners/issues/XXX

// Core Internal Imports
import { configureForDesktop, resolveConfig, resolveHooks } from './index.js'
import * as mobile from './mobile/index.js'
import { resolveViteConfig } from './vite/index.js'
import { loadEnvironmentVariables } from './assets/services/env/index.js'
import { ScopedLogger } from './vite/logger.js'

type CliOptions = import('electron-builder').CliOptions

const replaceAllSpecialCharacters = (str: string) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) => new RegExp(str).toString().split('/').slice(1, -1).join('/')

// ------------------------ Main Exports ------------------------

export const buildServices = async (config: UserConfig = {}, options: ServiceBuildOptions = {}) => {
  const { dev = false, services, rebuild = true  } = options

  const { outDir } = options

  const resolvedConfig = await resolveConfig(config, { services, build: true })
  const { hooks } = resolvedConfig

  const { root, target } = resolvedConfig

  const servicesToBuild = getServicesToBuild(resolvedConfig, dev)
  if (servicesToBuild.length === 0) return [] // No services to build 

  hooks.emit({ type: 'build:assets:start', phase: 'services', services: servicesToBuild }) // Emit start event for service assets build

  const assets = await getServiceAssets(resolvedConfig, dev, rebuild, hooks)
  
  const results = await buildAssets(assets, {
    root,
    outDir: outDir ?? resolve(join(root, globalWorkspacePath, 'services')), // Default service output directory
    target,
  })

  hooks.emit({ type: 'build:assets:complete', phase: 'services' }) // Emit completion event for service assets build


  return results
}

export async function buildApp(
  config: UserConfig = {},

  // Hooks
  {
    services: devServices,
    onBuildAssets,
    dev = false, // Default to a production build
    rebuildServices = true, // Rebuild services by default
    overwrite = false, // Overwrite existing files
    hooks: optHooks, // Hooks interface for CLI integration
  }: BuildHooks = {}
) {
  const _vite = await vite


  const hooks = config.hooks = await resolveHooks(config.hooks, optHooks)


  try {

    // ---------------- Proper Configuration Resolution ----------------
    const resolvedConfig = await resolveConfig(config, { build: true })
    const { root, target, build = {}, hooks } = resolvedConfig

    // Emit build start event
    hooks.emit({ type: 'build:start', config: resolvedConfig, dev })

    const { publish, sign } = build

    const isElectronBuild = target === TARGET_ELECTRON
    const isDesktopBuild = isDesktop(target)
    const isMobileBuild = isMobile(target)

    // ---------------- Output Directory Resolution ----------------
    const defaultOutDir = join(root, globalWorkspacePath, target)
    let { outDir = defaultOutDir } = config

    const selectedOutDir = outDir // This is used for the actual build output

    const customTempDir = isDesktopBuild || isMobileBuild

    let wasOverwritten = false
    if (customTempDir) {
      outDir = join(root, globalTempDir, isElectronBuild ? DIR_ELECTRON : DIR_MOBILE)
      const { overwrite: __wasOverwritten } = await handleTemporaryDirectories(
        dirname(outDir),
        overwrite
      ) // Queue removal of temporary directories
      wasOverwritten = __wasOverwritten
    }

    outDir = resolve(outDir) // Ensure absolute path

    const name = resolvedConfig.name

    if (devServices) resolvedConfig.services = devServices // Ensure local services are resolved with the same information

    // ---------------- Clear Previous Builds ----------------
    if (isDesktopBuild && !dev) removeDirectory(join(globalWorkspacePath, 'services')) // Clear default service directory
    await removeDirectory(outDir)

    // ------------------ Set Resolved Configuration ------------------
    const configCopy = { ...resolvedConfig, target, outDir } // Replace with internal target representation

    // ---------------- Build App Assets ----------------
    if (isMobileBuild) await mobile.prebuild(configCopy) // Run mobile prebuild command

    // Build the standard output files using Vite. Force recognition as build
    hooks.emit({ type: 'build:assets:start', phase: 'frontend' })
    const resoledViteConfig = await resolveViteConfig(configCopy, { dev, hooks })
    const customViteLogger = new ScopedLogger((...args) => customViteLogger.call(() => hooks.emit({ type: 'log', args })))
    await _vite.build({ 
      ...resoledViteConfig, 
      customLogger: customViteLogger 
    })

    // Emit build event
    if (!wasOverwritten) hooks.emit({ type: 'build:assets:complete', phase: 'frontend' })

    // ---------------- Create Standard Output Files ----------------

    const assets = await buildAssets(await getAppAssets(configCopy, dev), { outDir, root, target })

    if (isDesktop(target)) {
      const _outputs = await buildServices(configCopy, { dev, outDir, rebuild: rebuildServices, hooks })
      assets.push(..._outputs)
    }

    if (onBuildAssets) {
      const result = onBuildAssets(outDir)
      if (result === null) return undefined // Skip packaging if requested
    }

    // ------------------------- Target-Specific Build Steps -------------------------
    if (isElectronBuild && !dev) {
      hooks.emit({ type: 'build:electron:start' })

      // Load environment into the app
      const env = loadEnvironmentVariables('production', root)

      Object.assign(process.env, env) // Merge environment variables into process.env

      const cwdRelativeOutDir = relative(process.cwd(), outDir)
      const relativeOutDir = relative(root, cwdRelativeOutDir)

      // Configure package.json for proper Electron build
      configureForDesktop(cwdRelativeOutDir, root, {
        name: name.toLowerCase().split(' ').join('-'),
        version: '0.0.0',
      })

      const { electron, appId, icon } = configCopy

      let { security } = electron
      security = security ?? true // Default to secure options

      const buildConfig = merge(
        electron.build ?? {},
        getBuildConfig()
      ) as WritableElectronBuilderConfig

      buildConfig.productName = name
      buildConfig.appId = appId

      const actualOutDir = isAbsolute(selectedOutDir)
        ? selectedOutDir
        : join(process.cwd(), selectedOutDir)

      buildConfig.directories.output = actualOutDir

      const files = (buildConfig.files = [`${relativeOutDir}/**`])

      // Ensure platform-specific configs exist
      const platforms = ['mac', 'win', 'linux']
      for (const platform of platforms) {
        if (!buildConfig[platform]) buildConfig[platform] = {}
      }

      // Set strong code-signing algorithm (Windows)
      if (!buildConfig.win.signingHashAlgorithms) buildConfig.win.signingHashAlgorithms = ['sha256']

      // Ensure proper linux configuration
      buildConfig.linux.executableName = buildConfig.productName
      Object.assign(buildConfig.linux, {
        executableName: buildConfig.productName,
        artifactName: '${productName}-${version}.${ext}',
      })

      // Handle extra resources and code signing
      const extraResources = (buildConfig.extraResources = [])
      const signIgnore = (buildConfig.mac.signIgnore = [])

      const resolveFileLocation = file => {
        const relPath = relative(cwdRelativeOutDir, file)
        return join(relativeOutDir, relPath)
      }

      assets.forEach(({ file, extraResource, sign, isDirectory = lstatSync(file).isDirectory() }) => {
        const location = resolveFileLocation(file)

        if (extraResource) {
          const glob = isDirectory ? join(location, '**') : location
          extraResources.push(glob)
          files.push(`!${glob}`)
        }

        // Ignore Code Signing for Certain Files (NOTE: "Failed to staple your application with code: 65" error)
        if (sign === false)
          signIgnore.push(convertToBaseRegexString(`${replaceAllSpecialCharacters(location)}(/.*)?$`))
      })

      // TODO: Get platform-specific icon
      const preferredMacIcon = getIcon(icon, { preferredFormats: ELECTRON_PREFERENCE })
      const preferredWinIcon = getIcon(icon, { preferredFormats: ELECTRON_WINDOWS_PREFERENCE })

      const resolveIconPath = path => {
        const resolved = isAbsolute(path) ? path : join(root, path)
        return resolved ? getAssetBuildPath(resolved, outDir) : resolved
      }

      if (preferredMacIcon) buildConfig.mac.icon = resolveIconPath(preferredMacIcon)
      if (preferredWinIcon) buildConfig.win.icon = resolveIconPath(preferredWinIcon)

      // Ensure proper absolute paths are provided for Electron build
      const electronTemplateDir = path.join(templateDir, DIR_ELECTRON)

      buildConfig.directories.buildResources = path.join(
        electronTemplateDir,
        buildConfig.directories.buildResources
      )

      const pathOptions = {
        afterSign: path.join(electronTemplateDir, 'build/notarize.cjs'),
        artifactBuildCompleted: undefined,
        sign: undefined,
        // afterPack: undefined
      }

      // strongly recommended: force electron-builder to use ASAR (it's default, but be explicit)
      if (buildConfig.asar === undefined) buildConfig.asar = true

      for (const key in pathOptions) {
        if (!buildConfig[key]) {
          const defaultValue = pathOptions[key]
          if (defaultValue !== undefined) buildConfig[key] = defaultValue
        } else if (typeof buildConfig[key] === 'string' && !isAbsolute(buildConfig[key]))
          buildConfig[key] = path.join(root, buildConfig[key]) // Resolve paths relative to the root
      }

      // TODO: Implement ASAR integrity checking
      // See: https://github.com/commoners/commoners/issues/XXX

      buildConfig.mac.entitlementsInherit = path.join(
        electronTemplateDir,
        buildConfig.mac.entitlementsInherit
      )

      // Only enable code signing if publishing or explicitly requested
      const toSign = publish || sign
      if (!toSign) {
        // Disable code signing for Mac
        buildConfig.mac.identity = null

        // Disable signing on Windows
        buildConfig.win.sign = async () => {}
        buildConfig.win.forceCodeSigning = false

        // Remove any environment variables that may interfere with signing
        const envVariablePrefixes = ['CSC_', 'WIN_CSC_']

        const matchedEnvVariables = Object.keys(process.env).filter(key =>
          envVariablePrefixes.some(prefix => key.startsWith(prefix))
        )

        matchedEnvVariables.forEach(key => delete process.env[key])
      }

      buildConfig.includeSubNodeModules = true // Always grab workspace dependencies

      // Correct for different project roots
      if (!('electronVersion' in buildConfig)) buildConfig.electronVersion = electronVersion

      const electronBuilderOpts: CliOptions = {
        config: buildConfig as Record<string, any>,
      }

      if (root) electronBuilderOpts.projectDir = root

      if (publish) electronBuilderOpts.publish = typeof publish === 'string' ? publish : 'always'
      else buildConfig.publish = null

      // Use electron-builder to package the app
      const { build } = await import('electron-builder')
      await build(electronBuilderOpts)

      hooks.emit({ type: 'build:electron:complete' })
    } else if (isMobileBuild) {
      const mobileOpts = { target: target as 'ios' | 'android', outDir }

      await mobile.init(mobileOpts, resolvedConfig)
      await mobile.open(mobileOpts, resolvedConfig)
    }

    // Emit build complete event
    hooks.emit({ type: 'build:complete', config: resolvedConfig, outDir: selectedOutDir })

    return outDir // Return the temporary output directory

  } catch (error) {

    hooks.emit({
      type: 'build:error',
      error: error as Error
    })

    throw error // Re-throw the error for further handling
  }
}

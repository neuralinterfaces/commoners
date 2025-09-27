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
import {
  BuildHooks,
  ServiceBuildOptions,
  ServiceRebuildOption,
  UserConfig,
  WritableElectronBuilderConfig,
  HooksInterface,
} from './types.js'
import { createNoOpHooks } from './hooks.js'

// Internal Utilities
import { getAppAssets, getServiceAssets, buildAssets, getAssetBuildPath } from './utils/assets.js'
import { lstatSync } from './utils/lstat.js'
import { removeDirectory } from './utils/files.js'
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from './assets/utils/icons.js'
import merge from './utils/merge.js'

// import {
//     chainAfterPack,
//     chainArtifactBuildCompleted,
//     debugAfterPack,
//     makeAfterPackEmbedAsarIntegrity,
//     readIntegrityResource,
//     afterPackFlipFuses
// } from "./utils/asar/security.js";

// import { logAsarState } from "./utils/asar/debug.js";

// Core Internal Imports
import { configureForDesktop, resolveConfig } from './index.js'
import * as mobile from './mobile/index.js'
import { resolveViteConfig } from './vite/index.js'
import { loadEnvironmentVariables } from './assets/services/env/index.js'

type CliOptions = import('electron-builder').CliOptions

const replaceAllSpecialCharacters = (str: string) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) =>
  new RegExp(str).toString().split('/').slice(1, -1).join('/')

type BuildAllAssetOptions = {
  dev?: boolean,
  rebuild?: ServiceRebuildOption,
  hooks?: HooksInterface
}
export const buildAllAssets = async (
  config, 
  opts = {} as BuildAllAssetOptions
) => {

  const { dev, rebuild = true, hooks = createNoOpHooks() } = opts


  const { outDir, root, target } = config
  const appAssets = await getAppAssets(config, dev)

  const outputs = await buildAssets(appAssets, {
    outDir,
    root,
    target,
  })

  if (dev || isDesktop(target)) {
    const _outputs = await buildServices(config, {
      dev,
      outDir,
      rebuild,
      hooks
    }) // Only build when in development, or during desktop builds
    outputs.push(..._outputs)
  }

  return outputs
}

// ------------------------ Main Exports ------------------------

export const buildServices = async (config: UserConfig = {}, options: ServiceBuildOptions = {}) => {
  const { dev = false, services, rebuild = true, hooks = createNoOpHooks() } = options

  const { outDir } = options

  // if (!dev) await printHeader(`${name} – ${buildOnlyServices ? 'Building Selected Services' : `${getTargetDisplayName(target)} Build`}`)

  const resolvedConfig = await resolveConfig(config, { services, build: true })

  const { root, target } = resolvedConfig

  const assets = await getServiceAssets(resolvedConfig, dev, rebuild, hooks)
  return await buildAssets(assets, {
    root,
    outDir: outDir ?? resolve(join(root, globalWorkspacePath, 'services')), // Default service output directory
    target,
  })
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
    hooks = createNoOpHooks(), // Hooks interface for CLI integration
  }: BuildHooks = {}
) {
  const _vite = await vite

  try {

    // ---------------- Proper Configuration Resolution ----------------
    const resolvedConfig = await resolveConfig(config, { build: true })
    const { root, target, build = {} } = resolvedConfig

    // Emit build start event
    hooks.emit({ type: 'build:start', config: resolvedConfig, dev })

    const { publish, sign } = build

    const isElectronBuild = target === 'electron'
    const isDesktopBuild = isDesktop(target)
    const isMobileBuild = isMobile(target)

    // ---------------- Output Directory Resolution ----------------
    const defaultOutDir = join(root, globalWorkspacePath, target)
    let { outDir = defaultOutDir } = config

    const selectedOutDir = outDir // This is used for the actual build output

    const customTempDir = isDesktopBuild || isMobileBuild

    let wasOverwritten = false
    if (customTempDir) {
      outDir = join(root, globalTempDir, isElectronBuild ? 'electron' : 'mobile')
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
    await _vite.build(await resolveViteConfig(configCopy, { dev }))

    // Emit build event
    if (!wasOverwritten) hooks.emit({ type: 'build:assets:complete', phase: 'frontend' })

    // ---------------- Create Standard Output Files ----------------
    hooks.emit({ type: 'build:assets:start', phase: 'services' })
    const assets = await buildAllAssets(configCopy, { dev, rebuild: rebuildServices, hooks })
    hooks.emit({ type: 'build:assets:complete', phase: 'services' })

    if (onBuildAssets) {
      const result = onBuildAssets(outDir)
      if (result === null) return // Skip packaging if requested
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
      const electronTemplateDir = path.join(templateDir, 'electron')

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

      // // Ensure electron-builder runs our integrity injector first, then flips fuses
      // if (buildConfig.asar && security.integrity) {

      //     // Create debugged hook functions
      //     const debuggedAfterPackFlipFuses = async (context: any) => {
      //         const asarPath = join(context.appOutDir, 'resources', 'app.asar');
      //         logAsarState('BEFORE_FUSE_FLIP', asarPath, { hook: 'afterPackFlipFuses' });

      //         await afterPackFlipFuses(context);

      //         logAsarState('AFTER_FUSE_FLIP', asarPath, { hook: 'afterPackFlipFuses' });
      //     };

      //     // Add this after your signing step
      //     const verifyIntegrityAfterSigning = async (config: any, fail = true) => {
      //         const exePath = path.resolve(config.file);

      //         // Log ASAR state during artifact build completion
      //         const artifactDir = path.dirname(exePath);
      //         const possibleAsarPaths = [
      //             path.join(artifactDir, 'win-unpacked', 'resources', 'app.asar'),
      //             path.join(path.dirname(artifactDir), 'win-unpacked', 'resources', 'app.asar'),
      //         ];

      //         for (const asarPath of possibleAsarPaths) {
      //             if (existsSync(asarPath)) {
      //                 logAsarState('ARTIFACT_BUILD_COMPLETED_VERIFICATION', asarPath, {
      //                     artifact: path.basename(exePath),
      //                     hook: 'verifyIntegrityAfterSigning'
      //                 });
      //                 break;
      //             }
      //         }

      //         const embedded = readIntegrityResource(exePath);
      //         if (!embedded.length) {
      //             const message = `⚠️\tNo integrity resource found in ${exePath}. This may indicate a problem with the signing process.`;
      //             if (fail)  throw new Error(message);
      //             console.warn(message);
      //             return;
      //         }
      //     };

      //     // OPTIONAL: if you still patch app.asar (e.g., your test blocker), do it here.
      //     // Ensure it modifies the ASAR at `${appOutDir}/resources/app.asar` (Win/Linux) or
      //     // `${appOutDir}/${product}.app/Contents/Resources/app.asar` (macOS).
      //     const mutateAsar = async ({ appOutDir, productName }) => {
      //         // Track ASAR state before mutation
      //         const asarPath = join(appOutDir, 'resources', 'app.asar');
      //         logAsarState('MUTATE_ASAR_START', asarPath, { hook: 'mutateAsar' });

      //         // Example: run your patcher here so the final hash matches what ships.
      //         // await cp.execFile('node', ['utilities/patch-electron-asar.js', '--app', appOutDir]);
      //         console.log('🔧 ASAR mutation step (currently no-op)');

      //         logAsarState('MUTATE_ASAR_END', asarPath, { hook: 'mutateAsar' });
      //     };

      //     // Hook setup with comprehensive debugging
      //     buildConfig.afterPack = chainAfterPack(
      //         buildConfig.afterPack,
      //         debugAfterPack,
      //         debuggedAfterPackFlipFuses,                            // flip fuses first
      //         makeAfterPackEmbedAsarIntegrity(mutateAsar)           // then embed integrity LAST
      //     );

      //     buildConfig.artifactBuildCompleted = chainArtifactBuildCompleted(
      //         buildConfig.artifactBuildCompleted,
      //         (config) => {
      //             // Add comprehensive logging for artifact build completion
      //             const exePath = path.resolve(config.file);
      //             console.log(`\n🔍 Artifact Build Completed: ${path.basename(exePath)}`);

      //             // Find and log the associated unpacked directory
      //             const artifactDir = path.dirname(exePath);
      //             const possibleUnpackedDirs = [
      //                 path.join(artifactDir, 'win-unpacked'),
      //                 path.join(path.dirname(artifactDir), 'win-unpacked'),
      //             ];

      //             for (const unpackedDir of possibleUnpackedDirs) {
      //                 if (existsSync(unpackedDir)) {
      //                     const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
      //                     if (existsSync(asarPath)) {
      //                         logAsarState('ARTIFACT_BUILD_COMPLETED', asarPath, {
      //                             artifact: path.basename(exePath),
      //                             unpackedDir,
      //                             hook: 'artifactBuildCompleted'
      //                         });
      //                     }
      //                 }
      //             }

      //             return verifyIntegrityAfterSigning(config, false);
      //         }
      //     );
      // }

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
    } else if (isMobileBuild) {
      const mobileOpts = { target, outDir }

      // @ts-expect-error
      await mobile.init(mobileOpts, resolvedConfig)

      // @ts-expect-error
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

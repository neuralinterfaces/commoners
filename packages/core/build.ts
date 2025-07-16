// Build-In Modules
import path, { dirname, isAbsolute, join, relative, resolve } from "node:path"

// General Internal Imports
import { isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, handleTemporaryDirectories, chalk, vite, electronVersion, PLATFORM } from "./globals.js"
import { BuildHooks, ServiceBuildOptions, ServiceRebuildOption, UserConfig, WritableElectronBuilderConfig } from "./types.js"

// Internal Utilities
import { 
    getAppAssets,
    getServiceAssets,
    buildAssets, 
    getAssetBuildPath 
} from "./utils/assets.js"
import { lstatSync } from './utils/lstat.js'
import { printHeader, printTarget } from "./utils/formatting.js"
import { removeDirectory } from './utils/files.js'
import { ELECTRON_PREFERENCE, ELECTRON_WINDOWS_PREFERENCE, getIcon } from "./assets/utils/icons.js"
import merge from './utils/merge.js'

// Core Internal Imports
import { configureForDesktop, resolveConfig } from "./index.js"
import * as mobile from './mobile/index.js'
import { resolveViteConfig } from './vite/index.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { loadEnvironmentVariables } from "./assets/services/env/index.js"

type CliOptions = import('electron-builder').CliOptions

const replaceAllSpecialCharacters = (str: string) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) => new RegExp(str).toString().split('/').slice(1, -1).join('/')


export const buildAllAssets = async ( 
    config, 
    dev,
    rebuildServices: ServiceRebuildOption = true
) => {
    const { outDir, root, target } = config
    const appAssets = await getAppAssets(config, dev)
    
    const outputs = await buildAssets(appAssets, {
        outDir,
        root,
        target
    })

    if (dev || isDesktop(target)) {
        const _outputs = await buildServices(config, { 
            dev, 
            outDir,
            rebuild: rebuildServices
        }) // Only build when in development, or during desktop builds
        outputs.push(..._outputs)
    }

    return outputs
}

// ------------------------ Main Exports ------------------------

export const buildServices = async (
    config: UserConfig = {},
    options: ServiceBuildOptions = {}
) => {

    const { dev = false, services, rebuild = true } = options

    let { outDir } = options

    // if (!dev) await printHeader(`${name} — ${buildOnlyServices ? 'Building Selected Services' : `${printTarget(target)} Build`}`)

    const resolvedConfig = await resolveConfig(config, { services, build: true })

    const { root, target } = resolvedConfig

    const assets = await getServiceAssets(resolvedConfig, dev, rebuild)
    return await buildAssets(
        assets, 
        {
            root,
            outDir: outDir ?? resolve(join(root, globalWorkspacePath, 'services')), // Default service output directory
            target
        }
    )
}

export async function buildApp (
    config: UserConfig = {},

    // Hooks
    {
        services: devServices,
        onBuildAssets,
        dev = false, // Default to a production build
        rebuildServices = true, // Rebuild services by default
        overwrite = false // Overwrite existing files
    }: BuildHooks = {},
    
) {

    const _vite = await vite

    const _chalk = await chalk


    // ---------------- Proper Configuration Resolution ----------------
    const resolvedConfig = await resolveConfig(config, { build: true })

    const { root, target, build = {} } = resolvedConfig
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
        const { overwrite: __wasOverwritten } = await handleTemporaryDirectories(dirname(outDir), overwrite) // Queue removal of temporary directories
        wasOverwritten = __wasOverwritten
    }

    outDir = resolve(outDir) // Ensure absolute path

    const name = resolvedConfig.name

    if (!dev) await printHeader(`${name} — ${printTarget(target)} Build`)

    if (devServices) resolvedConfig.services = devServices  // Ensure local services are resolved with the same information


    // ---------------- Clear Previous Builds ----------------
    if (isDesktopBuild && !dev) removeDirectory(join(globalWorkspacePath, 'services')) // Clear default service directory
    await removeDirectory(outDir)

    // ------------------ Set Resolved Configuration ------------------
    const configCopy = { ...resolvedConfig, target, outDir } // Replace with internal target representation

    // ---------------- Build App Assets ----------------
    if (isMobileBuild) await mobile.prebuild(configCopy) // Run mobile prebuild command

    // Build the standard output files using Vite. Force recognition as build
    await _vite.build(await resolveViteConfig(configCopy, { dev }))

    // Log build success
    if (!wasOverwritten) console.log(`${dev ? '' : '\n'}🚀 ${_chalk.bold(_chalk.greenBright('Frontend'))} built successfully\n`)

    // ---------------- Create Standard Output Files ----------------
    const assets = await buildAllAssets(configCopy, dev, rebuildServices)

    if (onBuildAssets) {
        const result = onBuildAssets(outDir)
        if (result === null) return // Skip packaging if requested
    }

    // ------------------------- Target-Specific Build Steps -------------------------
    if (isElectronBuild && !dev) {

        console.log(`\n👊 Running ${_chalk.bold(_chalk.cyanBright('electron-builder'))}\n`)

        // Load environment into the app
        const env = loadEnvironmentVariables('production', root)
        Object.assign(process.env, env) // Merge environment variables into process.env

        const cwdRelativeOutDir = relative(process.cwd(), outDir)
        const relativeOutDir = relative(root, cwdRelativeOutDir)

        // Configure package.json for proper Electron build
        configureForDesktop(cwdRelativeOutDir, root, {
            name: name.toLowerCase().split(' ').join('-'), 
            version: '0.0.0'
        })

        const { electron, appId, icon } = configCopy

        const buildConfig = merge((electron.build ?? {}), getBuildConfig()) as WritableElectronBuilderConfig

        buildConfig.productName = name
        buildConfig.appId = appId

        const actualOutDir = isAbsolute(selectedOutDir) ? selectedOutDir : join(process.cwd(), selectedOutDir)

        buildConfig.directories.output = actualOutDir

        const files = buildConfig.files = [ 
            `${relativeOutDir}/**`, 
        ]

        // Ensure platform-specific configs exis
        const platforms = ["mac", "win", "linux"]
        for (const platform of platforms) {
            if (!buildConfig[platform]) buildConfig[platform] = {}
        }

        // Set strong code-signing algorithm (Windows)
        if (!buildConfig.win.signingHashAlgorithms) buildConfig.win.signingHashAlgorithms = [ 'sha256' ]

        // Ensure proper linux configuration
        buildConfig.linux.executableName = buildConfig.productName
        Object.assign(buildConfig.linux, {
            executableName: buildConfig.productName,
            artifactName: "${productName}-${version}.${ext}"
        })
        
        // Handle extra resources and code signing
        const extraResources = buildConfig.extraResources = []
        const signIgnore = buildConfig.mac.signIgnore = []
        
        const resolveFileLocation = (file) => {
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
            if (sign === false) signIgnore.push(convertToBaseRegexString(`${replaceAllSpecialCharacters(location)}(/.*)?$`))
        })

        // TODO: Get platform-specific icon
        const preferredMacIcon = getIcon(icon, { preferredFormats: ELECTRON_PREFERENCE })
        const preferredWinIcon = getIcon(icon, { preferredFormats: ELECTRON_WINDOWS_PREFERENCE })

        const resolveIconPath = (path) => {
            const resolved = isAbsolute(path) ? path : join(root, path)
            return resolved ? getAssetBuildPath(resolved, outDir) : resolved
        }

        if (preferredMacIcon) buildConfig.mac.icon = resolveIconPath(preferredMacIcon)
        if (preferredWinIcon) buildConfig.win.icon = resolveIconPath(preferredWinIcon)

        // Ensure proper absolute paths are provided for Electron build
        const electronTemplateDir = path.join(templateDir, 'electron')
        
        buildConfig.directories.buildResources = path.join(electronTemplateDir, buildConfig.directories.buildResources)
        buildConfig.afterSign = typeof buildConfig.afterSign === 'string' ? path.join(electronTemplateDir, buildConfig.afterSign) : buildConfig.afterSign
        buildConfig.mac.entitlementsInherit = path.join(electronTemplateDir, buildConfig.mac.entitlementsInherit)

        // Disable code signing if publishing or explicitly requested
        const toSign = publish || sign
        if (!toSign) buildConfig.mac.identity = null

        buildConfig.includeSubNodeModules = true // Always grab workspace dependencies

        // Correct for different project roots
        if (!('electronVersion' in buildConfig)) buildConfig.electronVersion = electronVersion
        
        const electronBuilderOpts: CliOptions = {  
            config: buildConfig as any 
        }

        if (root) electronBuilderOpts.projectDir = root
        

        if (publish) electronBuilderOpts.publish = typeof publish === 'string' ? publish : 'always'
        else buildConfig.publish = null

        // Use electron-builder to package the app
        const { build } = await import('electron-builder')
        await build(electronBuilderOpts)

    }

    else if (isMobileBuild) {

        const mobileOpts = { target, outDir }

        // @ts-ignore
        await mobile.init(mobileOpts, resolvedConfig)

        // @ts-ignore
        await mobile.open(mobileOpts, resolvedConfig)
    }


    return outDir // Return the temporary output directory
    
}
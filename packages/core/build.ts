// Build-In Modules
import path, { dirname, isAbsolute, join, relative, resolve } from "node:path"

// General Internal Imports
import { isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, handleTemporaryDirectories, chalk, vite, electronVersion } from "./globals.js"
import { BuildHooks, ServiceBuildOptions, UserConfig, WritableElectronBuilderConfig } from "./types.js"

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

type CliOptions = import('electron-builder').CliOptions

const replaceAllSpecialCharacters = (str: string) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) => new RegExp(str).toString().split('/').slice(1, -1).join('/')


export const buildAllAssets = async ( config, dev ) => {
    const { outDir, root, target } = config
    const appAssets = await getAppAssets(config, dev)
    
    const outputs = await buildAssets(appAssets, {
        outDir,
        root,
        target
    })

    if (dev || isDesktop(target)) {
        const _outputs = await buildServices(config, { dev, outDir }) // Only build when in development, or during desktop builds
        outputs.push(..._outputs)
    }

    return outputs
}

// ------------------------ Main Exports ------------------------

export const buildServices = async (
    config: UserConfig = {},
    options: ServiceBuildOptions = {}
) => {

    const { dev = false, services } = options

    let { outDir } = options

    // if (!dev) await printHeader(`${name} — ${buildOnlyServices ? 'Building Selected Services' : `${printTarget(target)} Build`}`)

    const resolvedConfig = await resolveConfig(config, { services, build: true })

    const { root, target } = resolvedConfig

    const assets = await getServiceAssets(resolvedConfig, dev)
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
        dev = false // Default to a production build
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
    if (customTempDir) {
        outDir = join(root, globalTempDir, isElectronBuild ? 'electron' : 'mobile')
        await handleTemporaryDirectories(dirname(outDir)) // Queue removal of temporary directories
    }

    outDir = resolve(outDir) // Ensure absolute path

    const name = resolvedConfig.name

    if (!dev) await printHeader(`${name} — ${printTarget(target)} Build`)

    if (devServices) resolvedConfig.services = devServices  // Ensure local services are resolved with the same information


    // ---------------- Clear Previous Builds ----------------
    if (isDesktopBuild)  await removeDirectory(join(globalWorkspacePath, 'services')) // Clear default service directory
    await removeDirectory(outDir)

    // ------------------ Set Resolved Configuration ------------------
    const configCopy = { ...resolvedConfig, target, outDir } // Replace with internal target representation

    // ---------------- Build App Assets ----------------
    if (isMobileBuild) await mobile.prebuild(configCopy) // Run mobile prebuild command

    // Build the standard output files using Vite. Force recognition as build
    await _vite.build(await resolveViteConfig(configCopy, { dev }))

    // Log build success
    console.log(`${dev ? '' : '\n'}🚀 ${_chalk.bold(_chalk.greenBright('Frontend'))} built successfully\n`)

    // ---------------- Create Standard Output Files ----------------
    const assets = await buildAllAssets(configCopy, dev)

    if (onBuildAssets) {
        const result = onBuildAssets(outDir)
        if (result === null) return // Skip packaging if requested
    }

    // ------------------------- Target-Specific Build Steps -------------------------
    if (isElectronBuild) {

        console.log(`\n👊 Running ${_chalk.bold(_chalk.cyanBright('electron-builder'))}\n`)

        const cwdRelativeOutDir = relative(process.cwd(), outDir)
        const relativeOutDir = relative(root, cwdRelativeOutDir)

        // Configure package.json for proper Electron build
        await configureForDesktop(cwdRelativeOutDir, root, {
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

        // Ensure platform-specific configs exist
        if (!buildConfig.mac) buildConfig.mac = {}
        if (!buildConfig.win) buildConfig.win = {}
        if (!buildConfig.linux) buildConfig.linux = {}

        // Ensure proper linux configuration
        buildConfig.linux.executableName = buildConfig.productName
        Object.assign(buildConfig.linux, {
            executableName: buildConfig.productName,
            artifactName: "${productName}-${version}.${ext}"
        })
        
        // Handle extra resources and code signing
        const extraResources = buildConfig.extraResources = []
        const signIgnore = buildConfig.mac.signIgnore = []

        assets.forEach(({ file, extraResource, sign }) => {

            const relPath = relative(cwdRelativeOutDir, file)
            const location = join(relativeOutDir, relPath)

            const glob = (lstatSync(file).isDirectory()) ? join(location, '**') : location

            if (extraResource) {
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

        const electronBuilderOpts: CliOptions = {  config: buildConfig as any  }

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
    
}
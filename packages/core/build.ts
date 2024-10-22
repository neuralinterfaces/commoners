// Build-In Modules
import path, { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { lstatSync } from "node:fs"

// General Internal Imports
import { isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, handleTemporaryDirectories, chalk, vite, electronVersion } from "./globals.js"
import { BuildOptions, BuildHooks, WritableElectronBuilderConfig } from "./types.js"

// Internal Utilities
import { clear, buildAssets, getAssetBuildPath } from "./utils/assets.js"
import { printHeader, printTarget } from "./utils/formatting.js"
import { getIcon } from "./utils/index.js"
import merge from './utils/merge.js'

// Core Internal Imports
import { configureForDesktop, resolveConfig } from "./index.js"
import * as mobile from './mobile/index.js'
import { resolveViteConfig } from './vite/index.js'

type CliOptions = import('electron-builder').CliOptions

const replaceAllSpecialCharacters = (str: string) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')

const convertToBaseRegexString = (str: string) => new RegExp(str).toString().split('/').slice(1, -1).join('/')

// Types
export default async function build (
    opts: BuildOptions = {},

    // Hooks
    {
        services: devServices,
        onBuildAssets,
        dev = false // Default to a production build
    }: BuildHooks = {},
    
) {

    const _vite = await vite

    const _chalk = await chalk

    // ---------------- Custom Service Resolution ----------------
    const buildTarget = opts.build?.target ?? opts.target
    const target = await ensureTargetConsistent(buildTarget)

    const buildOpts = opts.build ?? {}

    let { services: userRebuildServices } = buildOpts

    const { publish, sign } = buildOpts

    const servicesToUse = !buildTarget ? userRebuildServices : undefined

    // Setup cleanup commands for after desktop build
    const isElectronBuild = target === 'electron'
    const isDesktopBuild = isDesktop(target)
    const isMobileBuild = isMobile(target)

    // ---------------- Proper Configuration Resolution ----------------
    const buildOnlyServices = !!servicesToUse

    const resolvedConfig = await resolveConfig(opts, { 
        services: servicesToUse, // Always maintain services for desktop builds
        target,
        build: true
    })


    const { root } = resolvedConfig

    // ---------------- Output Directory Resolution ----------------
    const customOutDir = opts?.build?.outDir

    const selectedOutDir = customOutDir ?? join(root, globalWorkspacePath, target) // From explicit path
    let outDir = selectedOutDir  // From project base

    const customTempDir = isDesktopBuild || isMobileBuild
    if (customTempDir) {
        outDir = join(root, globalTempDir, isElectronBuild ? 'electron' : 'mobile')
        await handleTemporaryDirectories(dirname(outDir)) // Queue removal of temporary directories
    }

    outDir = resolve(outDir) // Ensure absolute path

    const name = resolvedConfig.name

    if (!dev) await printHeader(`${name} — ${buildOnlyServices ? 'Building Selected Services' : `${printTarget(target)} Build`}`)

    if (devServices) resolvedConfig.services = devServices // Ensure local services are resolved with the same information

    // Rebuild frontend unless services are explicitly requested
    const toRebuild = { 
        assets: !buildOnlyServices,
        services: buildOnlyServices
    } 


    // ---------------- Clear Previous Builds ----------------
    if (isDesktopBuild)  await clear(join(globalWorkspacePath, 'services')) // Clear default service directory
    if (toRebuild.assets) await clear(outDir)

    // ---------------- Build Assets ----------------
    if (toRebuild.assets) {
        if (isMobileBuild) await mobile.prebuild(resolvedConfig) // Run mobile prebuild command

        // Build the standard output files using Vite. Force recognition as build
        await _vite.build(await resolveViteConfig(resolvedConfig, { target, outDir, dev }))

        // Log build success
        console.log(`${dev ? '' : '\n'}🚀 ${_chalk.bold(_chalk.greenBright('Frontend'))} built successfully\n`)
    }

    // ---------------- Create Standard Output Files ----------------
    const configCopy = { ...resolvedConfig, target } // Replace with internal target representation
    configCopy.build = { ...buildOpts, outDir }  

    const assets = await buildAssets( configCopy, toRebuild, dev)

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

        const buildConfig = merge((resolvedConfig.electron.build ?? {}), getBuildConfig()) as WritableElectronBuilderConfig

        buildConfig.productName = name
        buildConfig.appId = resolvedConfig.appId

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
        const rawIconSrc = getIcon(resolvedConfig.icon)
        if (rawIconSrc) {
            const defaultIcon = isAbsolute(rawIconSrc) ? rawIconSrc : join(root, rawIconSrc)
            const macIcon = defaultIcon ? getAssetBuildPath(defaultIcon, outDir) : defaultIcon // icon && typeof icon === 'object' && 'mac' in icon ? icon.mac : defaultIcon
            buildConfig.mac.icon = macIcon 
            buildConfig.win.icon = macIcon // icon && typeof icon === 'object' && 'win' in icon ? icon.win : defaultIcon
    
        }
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
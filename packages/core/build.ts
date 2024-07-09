import path, { dirname, join, relative, resolve } from "node:path"
import { dependencies, isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, initialize } from "./globals.js"
import { BuildOptions, ResolvedConfig, WritableElectronBuilderConfig, validDesktopTargets } from "./types.js"
import { getIcon } from "./utils/index.js"

import * as mobile from './mobile/index.js'
import { CliOptions, build as ElectronBuilder } from 'electron-builder'

import { configureForDesktop, resolveConfig } from "./index.js"
import { clear, buildAssets } from "./utils/assets.js"

import { resolveViteConfig } from './vite/index.js'

import { build as ViteBuild } from 'vite'
import chalk from "chalk"

import merge from './utils/merge.js'
import { lstatSync } from "node:fs"

type BuildHooks = {
    services?: ResolvedConfig['services']
    onBuildAssets?: Function,
    dev?: boolean
}

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


    // ---------------- Custom Service Resolution ----------------
    const buildTarget = opts.build?.target ?? opts.target

    // `services` is a valid target in the build step
    const target = buildTarget === 'services' ? buildTarget : ensureTargetConsistent(buildTarget)

    const { 
        services: userRebuildServices = validDesktopTargets.includes(target),
        publish,
        sign,
    } = opts.build ?? {}

    const onlyBuildServices = target === 'services' || (!buildTarget && userRebuildServices)

    // Setup cleanup commands for after desktop build
    const isElectronBuild = target === 'electron'
    const isDesktopBuild = isDesktop(target)
    const isMobileBuild = isMobile(target)

    // ---------------- Proper Configuration Resolution ----------------
    const rebuildServices = userRebuildServices || onlyBuildServices
    
    const resolvedConfig = await resolveConfig(opts, { 
        services: isDesktopBuild ? undefined : rebuildServices, // Always maintain services for desktop builds
        mode: devServices ? undefined : (isDesktopBuild || onlyBuildServices ? 'local' : 'remote') // If no local services, this is a production build of some sort
    })

    const { root } = resolvedConfig

    // ---------------- Output Directory Resolution ----------------
    const customOutDir = opts?.build?.outDir
    let outDir = customOutDir ?? join(root, globalWorkspacePath, target) // From project base
    const selectedOutDir = customOutDir ?? join(globalWorkspacePath, target) // From selected root

    if (
        isElectronBuild || isMobileBuild
    ) {
        outDir = join(root, globalTempDir, isElectronBuild ? 'electron' : 'mobile')
        initialize(dirname(outDir)) // Clear temporary directories
    }

    outDir = resolve(outDir) // Ensure absolute path

    const name = resolvedConfig.name

    console.log(`\n✊ Building ${chalk.bold(chalk.greenBright(name))} ${onlyBuildServices ? 'services' : `for ${target}`}\n`)

    if (devServices) resolvedConfig.services = devServices // Ensure local services are resolved with the same information

    const toRebuild = {
        assets: !onlyBuildServices, // Rebuild frontend unless services are explicitly requested
        services: !!rebuildServices // Must explicitly decide to build services (if not desktop build)
    }

    // ---------------- Clear Previous Builds ----------------
    if (toRebuild.services) {
        await clear(join(globalWorkspacePath, 'services')) // Clear default service directory (not custom locations...)
    }

    if (toRebuild.assets) await clear(outDir)

    // ---------------- Build Assets ----------------
    if (toRebuild.assets) {
        if (isMobileBuild) await mobile.prebuild(resolvedConfig) // Run mobile prebuild command
        await ViteBuild(await resolveViteConfig(resolvedConfig, { target, outDir, dev }))  // Build the standard output files using Vite. Force recognition as build
    }

    // ---------------- Create Standard Output Files ----------------
    const configCopy = { ...resolvedConfig, target } // Replace with internal target representation
    configCopy.build = { ...opts.build, outDir }  

    const assets = await buildAssets( configCopy, { services: toRebuild.services } )

    if (onBuildAssets) {
        const result = onBuildAssets(outDir)
        if (result === null) return // Skip packaging if requested
    }

    
    // ------------------------- Target-Specific Build Steps -------------------------
    if (isElectronBuild) {

        console.log(`\n👊 Packaging with ${chalk.bold(chalk.cyanBright('electron-builder'))}\n`)

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

        buildConfig.directories.output = selectedOutDir

        const files = buildConfig.files = [ 
            `${relativeOutDir}/**`, 
        ]

        // Ensure platform-specific configs exist
        if (!buildConfig.mac) buildConfig.mac = {}
        if (!buildConfig.win) buildConfig.win = {}

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

        const defaultIcon = getIcon(resolvedConfig.icon)

        // TODO: Get platform-specific icon
        const macIcon = defaultIcon // icon && typeof icon === 'object' && 'mac' in icon ? icon.mac : defaultIcon
        const winIcon = macIcon // icon && typeof icon === 'object' && 'win' in icon ? icon.win : defaultIcon

        // Ensure proper absolute paths are provided for Electron build
        const electronTemplateDir = path.join(templateDir, 'electron')
        
        buildConfig.directories.buildResources = path.join(electronTemplateDir, buildConfig.directories.buildResources)
        buildConfig.afterSign = typeof buildConfig.afterSign === 'string' ? path.join(electronTemplateDir, buildConfig.afterSign) : buildConfig.afterSign
        buildConfig.mac.entitlementsInherit = path.join(electronTemplateDir, buildConfig.mac.entitlementsInherit)
        buildConfig.mac.icon = path.join(relativeOutDir, macIcon)
        buildConfig.win.icon = path.join(relativeOutDir, winIcon)

        // Disable code signing if publishing or explicitly requested
        const toSign = publish || sign
        if (!toSign) buildConfig.mac.identity = null

        buildConfig.includeSubNodeModules = true // Always grab workspace dependencies

        // Correct for different project roots
        if (!('electronVersion' in buildConfig)) {
            const electronVersion = dependencies.electron
            if (electronVersion[0] === '^') buildConfig.electronVersion = electronVersion.slice(1)
            else buildConfig.electronVersion = electronVersion
        }

        const buildOpts: CliOptions = { 
            config: buildConfig as any 
        }

        if (root) buildOpts.projectDir = root
        

        if (publish) buildOpts.publish = typeof publish === 'string' ? publish : 'always'
        else delete buildConfig.publish

        await ElectronBuilder(buildOpts)

    }

    else if (isMobileBuild) {
        const mobileOpts = { target, outDir }
        await mobile.init(mobileOpts, resolvedConfig)
        await mobile.open(mobileOpts, resolvedConfig)
    }
    
}
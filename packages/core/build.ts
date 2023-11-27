import path, { dirname, join, relative } from "node:path"
import { NAME, RAW_NAME, dependencies, isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, initialize } from "./globals.js"
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

// Types
export default async function build (
    opts: BuildOptions = {},
    devServices?: ResolvedConfig['services'],
) {

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

    const rebuildServices = userRebuildServices || onlyBuildServices
    
    const resolvedConfig = await resolveConfig(opts, { 
        services: isDesktopBuild ? undefined : rebuildServices, // Always maintain services for desktop builds
        mode: devServices ? undefined : (isDesktopBuild || onlyBuildServices ? 'local' : 'remote') // If no local services, this is a production build of some sort
    })

    let outDir;

    const selectedOutDir = outDir = join(resolvedConfig.root, opts?.build?.outDir ?? join(globalWorkspacePath, target))

    if (isElectronBuild || isMobileBuild) {
        outDir = join(resolvedConfig.root, globalTempDir, isElectronBuild ? 'electron' : 'mobile')
        initialize(dirname(outDir)) // Clear temporary directories
    }

    const name = resolvedConfig.name

    console.log(`\n✊ Building ${chalk.bold(chalk.greenBright(name))} ${onlyBuildServices ? 'services' : `for ${target}`}\n`)

    if (devServices) resolvedConfig.services = devServices // Ensure local services are resolved with the same information

    const toRebuild = {
        assets: !onlyBuildServices, // Rebuild frontend unless services are explicitly requested
        services: !!rebuildServices // Must explicitly decide to build services (if not desktop build)
    }

    if (toRebuild.services)  await clear(join(globalWorkspacePath, 'services'))
    if (toRebuild.assets) await clear(outDir)

    // Build assets
    if (toRebuild.assets) {
        if (isMobileBuild) await mobile.prebuild(resolvedConfig) // Run mobile prebuild command
        await ViteBuild(resolveViteConfig(resolvedConfig, { target, outDir }))  // Build the standard output files using Vite. Force recognition as build
    }

    // Create the standard output files
    const configCopy = { ...resolvedConfig }
    configCopy.build = { ...opts.build, outDir }  

    const toUnpack = await buildAssets(configCopy, isDesktopBuild ? (toRebuild.services ? 'electron-rebuild' : 'electron') : toRebuild.services ?? false)
    
    // ------------------------- Target-Specific Build Steps -------------------------
    if (isElectronBuild) {

        console.log(`\n👊 Packaging with ${chalk.bold(chalk.cyanBright('electron-builder'))}\n`)

        const relativeOutDir = relative(process.cwd(), outDir)


        await configureForDesktop(relativeOutDir) // Temporarily configure for temp directory

        const buildConfig = merge((resolvedConfig.electron.build ?? {}), getBuildConfig()) as WritableElectronBuilderConfig

        buildConfig.productName = name

        buildConfig.directories.output = selectedOutDir

        buildConfig.files = [ 
            `${relativeOutDir}/**`, 
        ]

        // Ensure platform-specific configs exist
        if (!buildConfig.mac) buildConfig.mac = {}
        if (!buildConfig.win) buildConfig.win = {}

        // // Dynamic asar unpacking (which doesn't work for services)
        // buildConfig.asar = true
        // buildConfig.asarUnpack = toUnpack.map(p => {
        //     if (lstatSync(p).isDirectory()) return join(p, '**')
        //     else return p
        // })

        const nameToUse = buildConfig.productName.toLowerCase().replaceAll(/\s+/g, '')
        buildConfig.appId = `com.${nameToUse}.app` // NOTE: Same as notarize.cjs
        buildConfig.win.executableName = nameToUse

        // Derive Electron version
        if (!('electronVersion' in buildConfig)) {
            const electronVersion = dependencies.electron
            if (electronVersion[0] === '^') buildConfig.electronVersion = electronVersion.slice(1)
            else buildConfig.electronVersion = electronVersion
        }

        const defaultIcon = getIcon(resolvedConfig.icon)

        // TODO: Get platform-specific icon
        const macIcon = defaultIcon // icon && typeof icon === 'object' && 'mac' in icon ? icon.mac : defaultIcon
        const winIcon = macIcon // icon && typeof icon === 'object' && 'win' in icon ? icon.win : defaultIcon

        // Ensure proper absolute paths are provided for Electron build
        const electronTemplateDir = path.join(templateDir, 'electron')
        
        buildConfig.directories.buildResources = path.join(electronTemplateDir, buildConfig.directories.buildResources)
        buildConfig.afterSign = typeof buildConfig.afterSign === 'string' ? path.join(electronTemplateDir, buildConfig.afterSign) : buildConfig.afterSign
        buildConfig.mac.entitlementsInherit = path.join(electronTemplateDir, buildConfig.mac.entitlementsInherit)
        buildConfig.mac.icon = macIcon ? path.join(relativeOutDir, macIcon) : path.join(templateDir, buildConfig.mac.icon)
        buildConfig.win.icon = winIcon ? path.join(relativeOutDir, winIcon) : path.join(templateDir, buildConfig.win.icon)

        // Disable code signing if publishing or explicitly requested
        const toSign = publish || sign
        if (!toSign) buildConfig.mac.identity = null

        buildConfig.includeSubNodeModules = true // Always grab workspace dependencies

        const buildOpts: CliOptions = { config: buildConfig as any }

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
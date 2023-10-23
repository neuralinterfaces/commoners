import path, { dirname, join } from "node:path"
import { NAME, RAW_NAME, dependencies, isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, onExit } from "./globals.js"
import { BuildOptions, ResolvedConfig } from "./types.js"
import { getIcon } from "./utils/index.js"

import * as mobile from './mobile/index.js'
import { CliOptions, build as ElectronBuilder } from 'electron-builder'

import { configureForDesktop, loadConfigFromFile, resolveConfig } from "./index.js"
import { clear, buildAssets } from "./utils/assets.js"

import { resolveViteConfig } from './vite/index.js'

import { build as ViteBuild } from 'vite'

const tempElectronDir = join(globalTempDir, 'electron')

// Types
export default async function build (
    configPath: string, // Require configuration path
    options: BuildOptions,
    localServices?: ResolvedConfig['services']
) {

    const target = ensureTargetConsistent(options.target)

    const defaultOutDir = join(globalWorkspacePath, target)

    const { 
        services: rebuildServices,
        publish,
    } = options


    // Setup cleanup commands for after desktop build
    const isDesktopBuild = isDesktop(target)


    const outDir = isDesktopBuild ? tempElectronDir : (options.outDir ?? defaultOutDir)

    const onlyBuildServices = !options.target && rebuildServices
    
    const resolvedConfig = await resolveConfig(await loadConfigFromFile(configPath), { 
        services: rebuildServices,

        // If no local services, this is a production build of some sort
        mode: localServices ? undefined : (isDesktopBuild ? 'local' : 'remote')
    })
    
    // Ensure local services are resolved with the same information
    if (localServices) resolvedConfig.services = localServices

    const toRebuild = {
        assets: !onlyBuildServices, // Rebuild frontend unless services are explicitly requested
        services: !!rebuildServices // Must explicitly decide to build services (if not desktop build)
    }

    // Clear only if both are going to be rebuilt    
    if (rebuildServices === true)  await clear(join(globalWorkspacePath, 'services')) // Clear all services and force rebuild
    if (toRebuild.assets) await clear(outDir)

    // Build assets
    if (toRebuild.assets) {
        if (isMobile(target)) await mobile.prebuild(resolvedConfig) // Run mobile prebuild command
        await ViteBuild(resolveViteConfig(resolvedConfig, { 
            target,
            outDir
        }))  // Build the standard output files using Vite. Force recognition as build
    }

    // Create the standard output files
    await buildAssets({
        config: {
            path: configPath,
            resolved: resolvedConfig
        },
        outDir,
        services: isDesktopBuild || toRebuild.services,
    })
    
    // ------------------------- Target-Specific Build Steps -------------------------
    if (isDesktopBuild) {

        await configureForDesktop(outDir) // Temporarily configure for temp directory

        const buildConfig = getBuildConfig()

        buildConfig.productName = NAME

        buildConfig.directories.output = options.outDir ?? defaultOutDir

        buildConfig.files = [ 
            `${outDir}/**/*`, 
            `${globalWorkspacePath}/services/**` // Include all service files
        ]

        // NOTE: These variables don't get replaced on Windows
        buildConfig.appId = buildConfig.appId.replace('${name}', RAW_NAME)
        buildConfig.win.executableName = buildConfig.win.executableName.replace('${name}', RAW_NAME)

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
        buildConfig.mac.icon = macIcon ? path.join(outDir, macIcon) : path.join(templateDir, buildConfig.mac.icon)
        buildConfig.win.icon = winIcon ? path.join(outDir, winIcon) : path.join(templateDir, buildConfig.win.icon)
        buildConfig.includeSubNodeModules = true // Always grab workspace dependencies

        const opts: CliOptions = { config: buildConfig as any }

        if (publish) opts.publish = typeof publish === 'string' ? publish : 'always'

        await ElectronBuilder(opts)

    }

    else if (isMobile(target)) {
        const mobileOpts = { target, outDir }
        await mobile.init(mobileOpts, resolvedConfig)
        await mobile.open(mobileOpts, resolvedConfig)
    }
}
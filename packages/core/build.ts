import path from "node:path"
import { NAME, RAW_NAME, dependencies, getBuildConfig, defaultOutDir, getAssetOutDir, templateDir, ensureTargetConsistent } from "./globals.js"
import { BuildOptions } from "./types.js"
import { getIcon } from "./utils/index.js"

import * as mobile from './mobile/index.js'
import { CliOptions, build as ElectronBuilder } from 'electron-builder'

import { loadConfigFromFile, resolveConfig } from "./index.js"
import { clear, buildAssets } from "./common.js"

import { resolveViteConfig } from './vite/index.js'
import { spawnProcess } from './utils/processes.js'

import { build as ViteBuild } from 'vite'
import chalk from "chalk"

// Types
export default async function build (
    configPath: string, // Require configuration path
    options: BuildOptions
) {

    const { 
        frontend,
        services,
        publish,
        outDir = defaultOutDir
    } = options

    const target = ensureTargetConsistent(options.target)

    const isDesktop = target === 'desktop'

    const assetOutDir = getAssetOutDir(outDir)

    const resolvedConfig = await resolveConfig(await loadConfigFromFile(configPath), { services })

    const toBuild = {
        frontend: frontend || !services,
        services: services || !frontend
    }

    // Clear only if both are going to be rebuilt
    if (toBuild.frontend && toBuild.services) await clear(outDir)

    // Build frontend
    if (toBuild.frontend) {
        if (target === 'mobile') await mobile.prebuild(resolvedConfig) // Run mobile prebuild command
        await ViteBuild(resolveViteConfig(resolvedConfig, { 
            target,
            outDir
        }))  // Build the standard output files using Vite. Force recognition as build
    }

    // Build services
    if (toBuild.services) {
        const { services } = resolvedConfig
        for (let name in services) {
            const service = services[name]
            let build = (service && typeof service === 'object') ? service.build : null 
            if (build && typeof build === 'function') build = build() // Run based on the platform if an object
            if (build) {
                console.log(`Running build command for the ${chalk.bold(name)} service`)
                await spawnProcess(build)
            }
        }
    }


    // Create the standard output files
    await buildAssets({
        config: configPath,
        outDir,
        services: isDesktop
    })
    
    // ------------------------- Target-Specific Build Steps -------------------------
    if (isDesktop) {

        const { services } = resolvedConfig

        const buildConfig = getBuildConfig()

        buildConfig.productName = NAME

        // NOTE: These variables don't get replaced on Windows
        buildConfig.appId = buildConfig.appId.replace('${name}', RAW_NAME)
        buildConfig.win.executableName = buildConfig.win.executableName.replace('${name}', RAW_NAME)

        // Register extra resources
        buildConfig.mac.extraResources = buildConfig.linux.extraResources = [ 
            // { from: outDir, to: outDir }, 
            ...Object.values(services).reduce((acc: string[], { extraResources }: any) => {
                if (extraResources) acc.push(...extraResources)
                return acc
            }, [])
        ]

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
        buildConfig.mac.icon = macIcon ? path.join(assetOutDir, macIcon) : path.join(templateDir, buildConfig.mac.icon)
        buildConfig.win.icon = winIcon ? path.join(assetOutDir, winIcon) : path.join(templateDir, buildConfig.win.icon)
        buildConfig.includeSubNodeModules = true // Allow for grabbing workspace dependencies

        const opts: CliOptions = { config: buildConfig as any }

        if (publish) opts.publish = typeof publish === 'string' ? publish : 'always'

        await ElectronBuilder(opts)
    }

    else if (target === 'mobile') {
        const mobileOpts = { target, outDir }
        await mobile.init(mobileOpts, resolvedConfig)
        await mobile.open(mobileOpts, resolvedConfig)
    }
}
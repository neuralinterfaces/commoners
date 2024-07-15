import path, { dirname, join, relative, resolve } from "node:path"
import { dependencies, isDesktop, getBuildConfig, globalTempDir, templateDir, ensureTargetConsistent, isMobile, globalWorkspacePath, initialize } from "./globals.js"
import { BuildOptions, ResolvedConfig, WritableElectronBuilderConfig, validDesktopTargets } from "./types.js"
import { getIcon } from "./utils/index.js"

import * as mobile from './mobile/index.js'
import { CliOptions, build as ElectronBuilder } from 'electron-builder'

import { configureForDesktop, resolveConfig } from "./index.js"
import { clear, buildAssets, getAssetBuildPath } from "./utils/assets.js"

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
    const target = ensureTargetConsistent(buildTarget)

    const buildOpts = opts.build ?? {}

    let { services: userRebuildServices } = buildOpts

    const {  publish, sign } = buildOpts

    const servicesToUse = !buildTarget ? userRebuildServices : undefined

    // Setup cleanup commands for after desktop build
    const isElectronBuild = target === 'electron'
    const isDesktopBuild = isDesktop(target)
    const isMobileBuild = isMobile(target)

    // ---------------- Proper Configuration Resolution ----------------
    const buildOnlyServices = !!servicesToUse
    console.log('Building', servicesToUse, buildTarget, userRebuildServices)

    const resolvedConfig = await resolveConfig(opts, { 
        services: servicesToUse, // Always maintain services for desktop builds
        target,
        build: true
    })

    const { root } = resolvedConfig

    // ---------------- Output Directory Resolution ----------------
    const customOutDir = opts?.build?.outDir
    let outDir = customOutDir ?? join(root, globalWorkspacePath, target) // From project base
    const selectedOutDir = customOutDir ?? join(globalWorkspacePath, target) // From selected root

    if (isDesktopBuild || isMobileBuild) {
        outDir = join(root, globalTempDir, isElectronBuild ? 'electron' : 'mobile')
        initialize(dirname(outDir)) // Clear temporary directories
    }

    outDir = resolve(outDir) // Ensure absolute path

    const name = resolvedConfig.name

    console.log(`\n✊ Building ${chalk.bold(chalk.greenBright(name))} ${buildOnlyServices ? 'services' : `for ${target}`}\n`)

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
        await ViteBuild(await resolveViteConfig(resolvedConfig, { target, outDir, dev }))  // Build the standard output files using Vite. Force recognition as build
    }

    // ---------------- Create Standard Output Files ----------------
    const configCopy = { ...resolvedConfig, target } // Replace with internal target representation
    configCopy.build = { ...buildOpts, outDir }  

    const assets = await buildAssets( configCopy, toRebuild )

    if (onBuildAssets) {
        const result = onBuildAssets(outDir)
        if (result === null) return // Skip packaging if requested
    }

    
    // ------------------------- Target-Specific Build Steps -------------------------
    if (isElectronBuild) {

        console.log(`\n👊 Running ${chalk.bold(chalk.cyanBright('electron-builder'))}\n`)

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

        // TODO: Get platform-specific icon
        const rawIconSrc = getIcon(resolvedConfig.icon)
        if (rawIconSrc) {
            const defaultIcon = join(root, rawIconSrc)
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
        if (!('electronVersion' in buildConfig)) {
            const electronVersion = dependencies.electron
            if (electronVersion[0] === '^') buildConfig.electronVersion = electronVersion.slice(1)
            else buildConfig.electronVersion = electronVersion
        }

        const electronBuilderOpts: CliOptions = { 
            config: buildConfig as any 
        }

        if (root) electronBuilderOpts.projectDir = root
        

        if (publish) electronBuilderOpts.publish = typeof publish === 'string' ? publish : 'always'
        else delete buildConfig.publish

        await ElectronBuilder(electronBuilderOpts)

    }

    else if (isMobileBuild) {
        const mobileOpts = { target, outDir }
        await mobile.init(mobileOpts, resolvedConfig)
        await mobile.open(mobileOpts, resolvedConfig)
    }
    
}
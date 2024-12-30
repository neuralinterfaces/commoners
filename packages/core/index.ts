// Built-In Modules
import { dirname, join, relative, normalize, resolve, isAbsolute } from 'node:path'
import { existsSync, unlink, writeFileSync } from 'node:fs'

// Internal Imports
import { globalWorkspacePath, getDefaultMainLocation, templateDir, onCleanup, ensureTargetConsistent, isMobile } from './globals.js'
import { ConfigResolveOptions, ResolvedConfig, ResolvedService, ServiceCreationOptions, TargetType, UserConfig } from './types.js'
import { resolveAll, createAll } from './assets/services/index.js'
import { resolveFile, getJSON } from './utils/files.js'
import merge from './utils/merge.js'
import { bundleConfig } from './utils/assets.js'
import { printFailure, printSubtle } from './utils/formatting.js'
import { lstatSync } from './utils/lstat.js'
import { pathToFileURL } from 'node:url'

const getAbsolutePath = (root: string, path: string) => isAbsolute(path) ? path : join(root, path)


// Top-Level Package Exports
export * from './types.js'
export * from './globals.js'
export * from './assets/services/index.js' // Service Helpers

export * as format from './utils/formatting.js'
export { launchApp as launch, launchServices } from './launch.js'
export { buildApp as build, buildServices } from './build.js'
export { app as start, services as startServices } from './start.js'
export { merge } // Other Helpers


// ------------------ Configuration File Handling ------------------
export const resolveConfigPath = (base = '') => resolveFile(join(base, 'commoners.config'), ['.ts', '.js'])

const isDirectory = (root: string) => lstatSync(root).isDirectory()

const isCommonersProject = async (
    root: string = process.cwd()
) => {

    const rootExists = existsSync(root)

    let failMessage = ''

    // Root does not exist
    if (root && !rootExists) failMessage = `This path does not exist.`

    // No index.html file
    else if (!existsSync(join(root, 'index.html'))) failMessage = `This directory does not contain an index.html file.`


    if (failMessage) {
        await printFailure(`Invalid Commoners project`)
        await printSubtle(failMessage)
        return false
    }

    return true
}

export async function loadConfigFromFile(
    root: string = resolveConfigPath()
) {


    const rootExists = existsSync(root)
    
    if (existsSync(root)) {
        root = resolve(root) // Resolve to absolute path
        if (!isDirectory(root)) root = dirname(root) // Get the parent directory
    }

    const isValidProject = await isCommonersProject(root)
    if (!isValidProject) process.exit(1)


    const configPath = resolveConfigPath(
        rootExists ? 
            root : // New root config
            '' // Base config
        )


    const resolvedRoot = configPath ? dirname(configPath) : root || process.cwd()

    let config = {} as UserConfig // No user-defined configuration found

    if (configPath) {

        const configOutputPath = join(resolvedRoot, globalWorkspacePath, `commoners.config.mjs`)
        const outputFiles = await bundleConfig(configPath, configOutputPath, { node: true })

        const fileURL = pathToFileURL(configOutputPath).href

        try {
            config = (await import(fileURL)).default as UserConfig
        } finally {
            onCleanup(() => outputFiles.forEach((file) => unlink(file, () => { })))
        }
    }

    // Set the root of the project
    config.root = relative(process.cwd(), resolvedRoot) || resolvedRoot

    return config
}


export async function resolveConfig(
    o: UserConfig = {}, 
    { 
        // Service Auto-Configuration
        build = false,

        // Advanced Service Configuration
        services

    } : ConfigResolveOptions = {}
) {

    if (o.__resolved) return o as ResolvedConfig
    
    // Mobile commands must always run from the root of the specified project
    if (isMobile(o.target) && o.root) {
        process.chdir(o.root)
        delete o.root
    }

    const root = o.root ?? (o.root = process.cwd()) // Always carry the root of the project

    const { services: ogServices, plugins, vite, ...temp } = o

    const userPkg = getJSON(join(root, 'package.json'))

    // Merge Config and package.json (transformed name)
    const copy = merge(structuredClone(temp) , {
        ...userPkg,
        name: userPkg.name ? userPkg.name.split('-').map(str => str[0].toUpperCase() + str.slice(1)).join(' ') : 'Commoners App'
    }) as Partial<ResolvedConfig>
    
    if (copy.outDir && !isAbsolute(copy.outDir)) copy.outDir = join(copy.root, copy.outDir)

    copy.plugins = plugins ?? {} // Transfer the original plugins
    copy.services = ogServices as any ?? {} // Transfer original functions on publish
    copy.vite = vite ?? {} // Transfer the original Vite config

    const target = copy.target = await ensureTargetConsistent(copy.target)

    if (!copy.electron) copy.electron = {}

    // Set default values for certain properties shared across config and package.json
    if (!copy.icon) copy.icon = join(templateDir, 'icon.png')

    if (!copy.version) copy.version = '0.0.0'

    if (!copy.appId) copy.appId = `com.${copy.name.replace(/\s/g, '').toLowerCase()}.app`
    
    // Always have a build options object
    if (!copy.build) copy.build = {}

    // Resolve pages
    if (!copy.pages) copy.pages = {}

    copy.pages = Object.entries(copy.pages).reduce(( acc, [ id, filepath ] ) => {
        acc[id] = getAbsolutePath(root, filepath)
        return acc
    }, {}) 

    if (services) {
        const selectedServices = typeof services === "string" ? [ services ] : services
        const allServices = Object.keys(copy.services)
        if (selectedServices) {
            if (!selectedServices.every(name => allServices.includes(name))) {
                await printFailure(`Invalid service selection`)
                await printSubtle(`Available services: ${allServices.join(', ')}`) // Print actual services as a nice list
                process.exit(1)
            }
        }
    }

    copy.services = await resolveAll(copy.services, { target, build, services, root: copy.root }) // Resolve selected services

    // Resolution flag
    Object.defineProperty(
        copy,
        '__resolved',
        {
            value: true,
            writable: false
        }
    )

    return copy as ResolvedConfig
}

const writePackageJSON = (o, root = '') => {
    writeFileSync(join(root, 'package.json'), JSON.stringify(o, null, 2)) // Will not update userPkg—but this variable isn't used for the Electron process
}

// Ensure project can handle --desktop command
export const configureForDesktop = async (outDir, root = '', defaults = {}) => {

    const userPkg = getJSON(join(root, 'package.json'))
    const pkg = { 
        ...defaults, 
        ...userPkg 
    }

    const resolvedOutDir = root ? relative(root, outDir) : outDir
    const defaultMainLocation = getDefaultMainLocation(resolvedOutDir)
    if (!pkg.main || normalize(pkg.main) !== normalize(defaultMainLocation)) {

        // Write back the original package.json on exit
        onCleanup(() => writePackageJSON(pkg, root))

        writePackageJSON({
            ...pkg, 
            main: defaultMainLocation 
        }, root)
    }

}

export const createServices = (services: ResolvedConfig['services'], opts: ServiceCreationOptions = {}) => createAll(services, opts)
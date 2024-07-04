import { dirname, join, relative, normalize, resolve } from 'node:path'
import { existsSync, lstatSync, unlink, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

import { dependencies, getDefaultMainLocation, templateDir, onExit, ensureTargetConsistent } from './globals.js'
import { ModeType, ResolvedConfig, ResolvedService, ServiceCreationOptions, UserConfig } from './types.js'

import { resolveAll, createAll } from './templates/services/index.js'
import { resolveFile, getJSON } from './utils/files.js'
import merge from './utils/merge.js'
import chalk from 'chalk'

// Exports
export * from './types.js'
export * from './globals.js'
export { default as launch } from './launch.js'
export { default as build } from './build.js'
export { default as share } from './share.js'
export { default as start } from './start.js'


export const defineConfig = (o: UserConfig): UserConfig => o

export const resolveConfigPath = (base = '') => resolveFile(join(base, 'commoners.config'), ['.ts', '.js'])

const isDirectory = (root: string) => lstatSync(root).isDirectory()

export async function loadConfigFromFile(root: string = resolveConfigPath(), selectedBuild?: string) {

    const rootExists = existsSync(root)

    if (rootExists) {
        root = resolve(root) // Resolve to absolute path
        if (!isDirectory(root)) root = dirname(root) // Get the parent directory
    }
    else {
        if (selectedBuild) {
            console.error(`${chalk.red(root)} does not exist in the ${chalk.bold(process.cwd())} directory.`)
            return
        }
        selectedBuild = root
        root = process.cwd()
    }
    

    const configPath = resolveConfigPath(
        rootExists ? 
            root : // New root config
            '' // Base config
        )

    let config = {} as UserConfig // No user-defined configuration found

    if (configPath) {

        // Bundle config file
        const result = await build({
            absWorkingDir: root,
            entryPoints: [ configPath ],
            outfile: 'out.js',
            write: false,
            target: ['node16'],
            platform: 'node',
            bundle: true,
            format: 'esm',
            external: [...Object.keys(dependencies)] // Ensure that Commoners dependencies are external
        })

        const { text } = result.outputFiles[0]

        // Load config from timestamped file
        const fileBase = `${configPath}.timestamp-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`
            
        const fileNameTmp = `${fileBase}.mjs`
        const fileUrl = `${pathToFileURL(fileBase)}.mjs`

        await writeFileSync(fileNameTmp, text)

        try {

            config = (await import(fileUrl)).default as UserConfig

            if (selectedBuild) {

                if (selectedBuild in (config.builds ?? {})) {
                    const originalRoot = root
                    const subRootPath = config.builds[selectedBuild]
                    const newRoot = join(originalRoot, subRootPath) // Resolved based on original root

                    if (!existsSync(newRoot)){
                        console.error(`The subroot ${chalk.red(subRootPath)} is does not exist for the ${chalk.bold(selectedBuild)} build.`)
                        return
                    }

                    const subConfig = await loadConfigFromFile(subRootPath)
                    root = newRoot

                    const transposedConfig = merge(config, {}, {
                        transform: (path, value) => {
                            if (path[0] === 'builds') return undefined
                            
                            if (value && typeof value === 'string') {
                                const resolved = join(originalRoot, value)
                                // Relink resolved files from the base root to the sub-root
                                if (existsSync(resolved)) return relative(root, join(originalRoot, value))
                            }
                            
                            // Provide original value
                            return value
                        }
                    })

                    config = merge(subConfig, transposedConfig, { arrays: true }) as UserConfig // Merge sub-config with base config

                    const rootConfigPath = resolveConfigPath(process.cwd())
                    config.__root = rootConfigPath
                } 
                
                else {
                    console.error(`The ${chalk.red(selectedBuild)} build does not exist in the current project`)
                    return
                }
            }

        } finally {
            unlink(fileNameTmp, () => { }) // Ignore errors
        }

    }

    // Set the root of the project
    config.root = relative(process.cwd(), root) || root

    return config
}

type ResolveOptions = {
    services?: string | string[] | boolean,
    customPort?: number,
    mode?: ModeType
}

export async function resolveConfig(
    o: UserConfig = {}, 
    { 
        services = true, 
        customPort,
        mode
    } : ResolveOptions = {}
) {

    const root = o.root ?? (o.root = process.cwd()) // Always carry the root of the project

    const temp = { ...o }
    const { services: ogServices, plugins } = temp
    delete temp.plugins
    delete temp.services



    const userPkg = getJSON(join(root, 'package.json'))

    // Merge Config and package.json (transformed name)
    const copy = merge(structuredClone(temp) , {
        ...userPkg,
        name: userPkg.name ? userPkg.name.split('-').map(str => str[0].toUpperCase() + str.slice(1)).join(' ') : 'Commoners App'
    }) as Partial<ResolvedConfig>
    
    copy.plugins = plugins // Transfer the original plugins
    copy.services = ogServices as any // Transfer original functions on publish

    copy.target = ensureTargetConsistent(copy.target, ['services'])
    
    if (!copy.electron) copy.electron = {}

    // Set default values for certain properties shared across config and package.json
    if (!copy.icon) copy.icon = join(templateDir, 'icon.png')
    if (!copy.version) copy.version = '0.0.0'

    if (!copy.appId) copy.appId = `com.${copy.name.replace(/\s/g, '').toLowerCase()}.app`
    
    // Always have a build options object
    if (!copy.build) copy.build = {}

    const isServiceOptionBoolean = typeof services === 'boolean'
    if (isServiceOptionBoolean && services === false) copy.services = undefined // Unset services (if set to false)

    copy.services = await resolveAll(copy.services, { mode, root: copy.root }) // Always resolve all backend services before going forward

    // Remove unspecified services
    if (services && !isServiceOptionBoolean) {

        const selected = typeof services === 'string' ? [ services ] : services
        const isSingleService = selected.length === 1

        for (let name in copy.services) {
            if (!selected.includes(name)) delete copy.services[name]
            else if (isSingleService && customPort) copy.services[name].port = customPort
        }
    }

    return copy as ResolvedConfig
}

const writePackageJSON = (o, root = '') => {
    writeFileSync(join(root, 'package.json'), JSON.stringify(o, null, 2)) // Will not update userPkg—but this variable isn't used for the Electron process
}

// Ensure project can handle --desktop command
export const configureForDesktop = async (outDir, root = '', defaults = {}) => {
    const pkg = { ...defaults, ...getJSON(join(root, 'package.json')) }
    const defaultMainLocation = getDefaultMainLocation(root ? relative(root, outDir) : outDir )
    if (!pkg.main || normalize(pkg.main) !== normalize(defaultMainLocation)) {
        onExit(() =>  writePackageJSON(pkg, root)) // Write back the original package.json on exit
        writePackageJSON({...pkg, main: defaultMainLocation}, root)
    }

}

export const createServices = async (services: ResolvedConfig['services'], opts: ServiceCreationOptions = {}) => await createAll(services, opts) as {
    active: {
        [name:string]: ResolvedService
    }
    close: (id?:string) => void
}
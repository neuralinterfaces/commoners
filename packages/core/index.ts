import { dirname, join, normalize } from 'node:path'
import { lstatSync, unlink, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

import { dependencies, getDefaultMainLocation, templateDir, onExit } from './globals.js'
import { ModeType, ResolvedConfig, ResolvedService, ServiceCreationOptions, UserConfig } from './types.js'

import { resolveAll, createAll } from './templates/services/index.js'
import { resolveFile, getJSON } from './utils/files.js'
import merge from './utils/merge.js'


// Exports
export * from './types.js'
export * from './globals.js'
export { default as launch } from './launch.js'
export { default as build } from './build.js'
export { default as share } from './share.js'
export { default as start } from './start.js'

export const defineConfig = (o: UserConfig): UserConfig => o

export const resolveConfigPath = (base = '') => resolveFile(join(base, 'commoners.config'), ['.ts', '.js'])

export async function loadConfigFromFile(filesystemPath: string = resolveConfigPath()) {

    if (lstatSync(filesystemPath).isDirectory()) filesystemPath = resolveConfigPath(filesystemPath)

    if (!filesystemPath) return {} as UserConfig

    // Bundle config file
    const result = await build({
        absWorkingDir: process.cwd(),
        entryPoints: [ filesystemPath ],
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
    const fileBase = `${filesystemPath}.timestamp-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
        
    const fileNameTmp = `${fileBase}.mjs`
    const fileUrl = `${pathToFileURL(fileBase)}.mjs`

    await writeFileSync(fileNameTmp, text)

    try {
        const result = (await import(fileUrl)).default as UserConfig
        result.root = dirname(filesystemPath)
        return result
    } finally {
        unlink(fileNameTmp, () => { }) // Ignore errors
    }
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

    const root = o.root ?? ''

    const temp = { ...o }
    const plugins = temp.plugins;
    delete temp.plugins
    const userPkg = getJSON(join(root, 'package.json'))
    const copy = merge(structuredClone(temp) , userPkg) as Partial<ResolvedConfig>
    copy.plugins = plugins // Transfer the original plugins

    if (!copy.electron) copy.electron = {}

    // Set default values for certain properties shared across config and package.json
    if (!copy.icon) copy.icon = join(templateDir, 'icon.png')
    if (!copy.root) copy.root = ''
    if (!copy.version) copy.version = '0.0.0'
    if (!copy.appId) copy.appId = `com.${copy.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.app`
    
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

const writePackageJSON = (o) => {
    writeFileSync('package.json', JSON.stringify(o, null, 2)) // Will not update userPkg—but this variable isn't used for the Electron process
}

// Ensure project can handle --desktop command
export const configureForDesktop = async (outDir) => {
    const pkg = getJSON('package.json')
    const defaultMainLocation = getDefaultMainLocation(outDir)
    if (!pkg.main || normalize(pkg.main) !== normalize(defaultMainLocation)) {
        onExit(() =>  writePackageJSON(pkg)) // Write back the original package.json on exit
        writePackageJSON({...pkg, main: defaultMainLocation})
    }

}

export const createServices = async (services: ResolvedConfig['services'], opts: ServiceCreationOptions = {}) => await createAll(services, opts) as {
    active: {
        [name:string]: ResolvedService
    }
    close: (id?:string) => void
}
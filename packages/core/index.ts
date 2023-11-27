import { dirname, join, normalize } from 'node:path'
import { lstatSync, unlink, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

import { dependencies, getDefaultMainLocation, userPkg, templateDir, onExit, NAME } from './globals.js'
import { ModeType, ResolvedConfig, ResolvedService, ServiceCreationOptions, UserConfig } from './types.js'

import { resolveAll, createAll } from './templates/services/index.js'
import { resolveFile } from './utils/files.js'


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

    const copy = { ...o } as Partial<ResolvedConfig> // NOTE: Will mutate the original object

    if (!copy.name) copy.name = NAME

    if (!copy.electron) copy.electron = {}

    if (!copy.icon) copy.icon = join(templateDir, 'icon.png')

    if (!copy.root) copy.root = ''

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
    const defaultMainLocation = getDefaultMainLocation(outDir)
    if (!userPkg.main || normalize(userPkg.main) !== normalize(defaultMainLocation)) {
        onExit(() =>  writePackageJSON(userPkg)) // Write back the original package.json on exit
        writePackageJSON({...userPkg, main: defaultMainLocation})
    }

}

export const createServices = async (services: ResolvedConfig['services'], opts: ServiceCreationOptions = {}) => await createAll(services, opts) as {
    active: {
        [name:string]: ResolvedService
    }
    close: (id?:string) => void
}
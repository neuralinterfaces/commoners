import { join, normalize } from 'node:path'
import { unlink, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

import { dependencies, getDefaultMainLocation, userPkg, templateDir, onExit } from './globals.js'
import { ModeType, ResolvedConfig, UserConfig } from './types.js'

import { resolveAll, createAll } from './templates/services/index.js'

// Exports
export * from './globals.js'
export { default as launch } from './launch.js'
export { default as build } from './build.js'
export { default as share } from './share.js'
export { default as start } from './start.js'

export const defineConfig = (o: UserConfig): UserConfig => o

// NOTE: Simplified from https://github.com/vitejs/vite/blob/c7969597caba80cf5d3348cba9f18ad9d14e9295/packages/vite/src/node/config.ts
export async function loadConfigFromFile(filepath: string) {

    if (!filepath) return {} as UserConfig

    // Bundle config file
    const result = await build({
        absWorkingDir: process.cwd(),
        entryPoints: [ filepath ],
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
    const fileBase = `${filepath}.timestamp-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
        
    const fileNameTmp = `${fileBase}.mjs`
    const fileUrl = `${pathToFileURL(fileBase)}.mjs`

    await writeFileSync(fileNameTmp, text)

    try {
        return (await import(fileUrl)).default as UserConfig
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
        services, 
        customPort,
        mode
    } : ResolveOptions = {}
) {

    const copy = { ...o } as Partial<ResolvedConfig> // NOTE: Will mutate the original object

    if (!copy.electron) copy.electron = {}

    if (!copy.icon) copy.icon = join(templateDir, 'icon.png')

    const isServiceOptionBoolean = typeof services === 'boolean'
    if (isServiceOptionBoolean && !services) copy.services = undefined // Unset services (if set to false)

    copy.services = await resolveAll(copy.services, { mode }) // Always resolve all backend services before going forward

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

export const createServices = async (services: ResolvedConfig['services'], port?: number) => {
    return await createAll(services, port) as ResolvedConfig['services']
}
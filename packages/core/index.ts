import { createServer as createViteServer } from 'vite'
import { extname, join, normalize, resolve, sep } from 'node:path'
import chalk from 'chalk'
import { unlink, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

import { resolveViteConfig } from './vite/index.js'

import { COMMAND, cliArgs, dependencies, configPath, defaultMainLocation, userPkg, templateDir } from './globals.js'
import { ResolvedConfig, UserConfig } from './types.js'

import { resolveAll, createAll } from './templates/services/index.js'

import { yesNo } from "./utils/inquirer.js";

// Exports
import { kill } from './utils/processes.js'
import { clearOutputDirectory, populateOutputDirectory } from './common.js'

export * as globals from './globals.js'
export { default as launch } from './launch.js'
export { default as build } from './build.js'
export { default as share } from './share.js'

export {
    kill,
    clearOutputDirectory,
    populateOutputDirectory
}

export const defineConfig = (o: UserConfig): UserConfig => o

// NOTE: Simplified from https://github.com/vitejs/vite/blob/c7969597caba80cf5d3348cba9f18ad9d14e9295/packages/vite/src/node/config.ts
export async function loadConfigFromFile(filepath: string = configPath) {
    if (!filepath) return

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
        external: [...Object.keys(dependencies)] // Ensure that COMMONERS dependencies are external
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
        return resolveConfig((await import(fileUrl)).default)
    } finally {
        unlink(fileNameTmp, () => { }) // Ignore errors
    }
}


export async function resolveConfig(o: UserConfig = {}) {

    const copy = { ...o } as Partial<ResolvedConfig> // NOTE: Will mutate the original object

    if (!copy.electron) copy.electron = {}

    if (!copy.icon) copy.icon = resolve(templateDir, 'icon.png')

    copy.services = await resolveAll(copy.services) // Always resolve all backend services before going forward


    // NOTE: MOVE SO THIS IS FILTERED LATER
    // Remove services that are not specified
    const selectedServices = cliArgs.service

    if (selectedServices) {
        const isSingleService = !Array.isArray(selectedServices)
        const selected = isSingleService ? [ selectedServices ] : selectedServices
        for (let name in copy.services) {
            if (!selected.includes(name)) delete copy.services[name]
            else if (isSingleService) {
                const customPort = cliArgs.port || (COMMAND === 'dev' ? process.env.PORT : null)
                if (customPort) copy.services[name].port = customPort
            }
        }
    }

    return copy as ResolvedConfig
}

export const configureForDesktop = async () => {

    // Ensure project can handle --desktop command
    if (!userPkg.main || normalize(userPkg.main) !== normalize(defaultMainLocation)) {
        const result = await yesNo('This project is not properly configured for desktop. Would you like to initialize it?')
        if (result) {
            const copy: any = {}
            console.log(chalk.green('Added a main entry to your package.json'))
            delete userPkg.main // Delete existing main entry
            Object.entries(userPkg).forEach(([name, value], i) => {
                if (i === 3) copy.main = defaultMainLocation
                copy[name] = value
            })
            writeFileSync('package.json', JSON.stringify(copy, null, 2)) // Will not update userPkg—but this variable isn't used for the Electron process
        } else throw new Error('This project is not compatible with desktop mode.')
    }

}

export const createServices = async (config) => {
    const resolvedConfig = await resolveConfig(config || await loadConfigFromFile());
    return await createAll(resolvedConfig.services)
}

type Options = {
    pwa?: boolean
}

type ServerOptions = {
    printUrls?: boolean,
} & Options

// Run a development server
export const createServer = async (config?: UserConfig | ResolvedConfig, opts: ServerOptions = {}) => {

    const resolvedConfig = await resolveConfig(config || await loadConfigFromFile());

    // Create the frontend server
    const server = await createViteServer(resolveViteConfig(resolvedConfig, opts, false))
    await server.listen()

    // Print out the URL if everything was initialized here (i.e. dev mode)
    if (opts.printUrls === false) {
        console.log('\n')
        server.printUrls()
        console.log('\n')
    }
}
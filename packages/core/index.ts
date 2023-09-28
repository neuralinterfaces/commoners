import { APPID, NAME, assetOutDir, cliArgs, commonersPkg, configPath, defaultMainLocation, userPkg } from './globals.js'
import { ResolvedConfig, UserConfig } from './types.js'

import { resolveAll, createAll } from '../../template/src/main/services/index.js'

export { default as launch } from './launch.js'
export { default as build } from './build.js'

import { ManifestOptions } from 'vite-plugin-pwa'

import { yesNo } from "./utils/inquirer.js";

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
        external: [...Object.keys(commonersPkg.dependencies)] // Ensure that COMMONERS dependencies are external
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

    copy.services = await resolveAll(copy.services) // Always resolve all backend services before going forward

    // Remove services that are not specified
    const selectedServices = cliArgs.service
    if (selectedServices) {
        const isSingleService = !Array.isArray(selectedServices)
        const selected = isSingleService ? [ selectedServices ] : selectedServices
        for (let name in copy.services) {
            if (!selected.includes(name)) delete copy.services[name]
            else if (isSingleService) {
                const customPort = cliArgs.port || process.env.PORT
                if (customPort) copy.services[name].port = customPort
            }
        }
    }

    // Run PWA prebuild to specify manifest file
    if (cliArgs.pwa) {

        const pwaOpts = ((!('pwa' in copy)) ? {} : copy.pwa) as Partial<ResolvedConfig['pwa']>
        if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []

        const fromHTMLPath = join(...assetOutDir.split(sep).slice(1))
        const icons = copy.icon ? (typeof copy.icon === 'string' ? [copy.icon] : Object.values(copy.icon)).map(str => join(fromHTMLPath, str)) : [] // Provide full path of the icon

        pwaOpts.includeAssets.push(...icons) // Include specified assets

        const baseManifest = {
            id: `?${APPID}=1`,

            start_url: '.',

            theme_color: '#ffffff', // copy.design?.theme_color ?? 
            background_color: "#fff",
            display: 'standalone',

            // Dynamic
            name: NAME,

            // short_name: NAME,
            description: userPkg.description,

            // Generated
            icons: icons.map(src => {
                return {
                    src,
                    type: `image/${extname(src).slice(1)}`,
                    sizes: 'any'
                }
            })
        } as Partial<ManifestOptions>

        pwaOpts.manifest = ('manifest' in pwaOpts) ? { ...baseManifest, ...pwaOpts.manifest } : baseManifest // Naive merge

        copy.pwa = pwaOpts as ResolvedConfig['pwa']
    }

    return copy as ResolvedConfig
}

import { createServer as createViteServer } from 'vite'
import { resolveViteConfig } from './vite.js'
import { extname, join, normalize, sep } from 'node:path'
import chalk from 'chalk'
import { unlink, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

export const configureForDesktop = async () => {

    // Ensure project can handle --desktop command
    if (!userPkg.main || normalize(userPkg.main) !== normalize(defaultMainLocation)) {
        const result = await yesNo('This COMMONERS project is not configured for desktop. Would you like to initialize it?')
        if (result) {
            const copy: any = {}
            console.log(chalk.green('Added a main entry to your package.json'))
            Object.entries(userPkg).forEach(([name, value], i) => {
                if (i === 3) copy.main = defaultMainLocation
                copy[name] = value
            })
            writeFileSync('package.json', JSON.stringify(copy, null, 2))
        } else throw new Error('This project is not compatible with desktop mode.')
    }

}

export const createServices = async (config) => {
    const resolvedConfig = await resolveConfig(config || await loadConfigFromFile());
    return await createAll(resolvedConfig.services)
}

// Run a development server
export const createServer = async (config?: UserConfig | ResolvedConfig, print = true) => {

    const resolvedConfig = await resolveConfig(config || await loadConfigFromFile());

    // Create the frontend server
    const server = await createViteServer(resolveViteConfig(resolvedConfig))
    await server.listen()

    // Print out the URL if everything was initialized here (i.e. dev mode)
    if (print) {
        console.log('\n')
        server.printUrls()
        console.log('\n')
    }
}
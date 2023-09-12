import { APPID, NAME, assetOutDir, cliArgs, configPath, userPkg } from '../../globals.js'
import { ResolvedConfig, UserConfig } from './types.js'

import { resolveAll, createAll } from '../../template/src/main/services/index.js'
import { clearOutputDirectory, populateOutputDirectory } from './common.js'

export { default as launch } from './launch.js'
export { default as commit } from './commit.js'
export { default as publish } from './publish.js'
export { default as build } from './build.js'

import { ManifestOptions } from 'vite-plugin-pwa'

import { loadConfigFromFile as viteConfigHelper } from 'vite';

export async function loadConfigFromFile(filepath: string = configPath) {
    const config = filepath ? (await viteConfigHelper({ command: 'build' } as any, filepath)).config : {} // NOTE: Piggyback off of Vite's configuration resolution system 
    return resolveConfig(config)
}

export async function resolveConfig(o: UserConfig = {}) {

    const copy = { ... o } as Partial<ResolvedConfig> // NOTE: Will mutate the original object

    if (!copy.electron) copy.electron = {}


    copy.services = await resolveAll(copy.services) // Always resolve all backend services before going forward

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
import { extname, join, sep } from 'node:path'

export const start = async (config?: UserConfig) => {
    await clearOutputDirectory()
    const resolvedConfig = config ? await resolveConfig(config) : await loadConfigFromFile();
    await populateOutputDirectory(resolvedConfig)
    await createServer(config, false)
}

// Run a development server that can be accessed through Electron or the browser
export const createServer = async (config?: UserConfig | ResolvedConfig, initialize = true) => {
    
    let resolvedConfig = config as ResolvedConfig

    if (initialize) {
        resolvedConfig = config ? await resolveConfig(config) : await loadConfigFromFile();
        await clearOutputDirectory()
        await populateOutputDirectory(resolvedConfig)
    }

    // Create all backend services 
    await createAll(config.services)

    // Create the frontend server
    const server = await createViteServer(resolveViteConfig(resolvedConfig))
    await server.listen()

    // Print out the URL if everything was initialized here (i.e. dev mode)
    if (initialize) {
        console.log('\n')
        server.printUrls()
        console.log('\n')
    }
}
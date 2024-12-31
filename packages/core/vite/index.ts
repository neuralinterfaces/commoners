// Built-In Modules
import { extname, isAbsolute, join, relative } from 'node:path'

// General Internal Imports
import { isDesktop, vite, chalk } from "../globals.js";
import { ResolvedConfig, ServerOptions, ViteOptions } from '../types.js'

// Internal Plugins
import electronPlugin from './plugins/electron/index.js'
import commonersPlugin from './plugins/commoners.js'

// Internal Imports
import { printServiceMessage } from '../utils/formatting.js';
import { getAssetBuildPath } from '../utils/assets.js';

import { getAllIcons, getIcon } from '../assets/utils/icons.js'
import { safePath } from '../assets/utils/paths.js'

type ManifestOptions = import ('vite-plugin-pwa').ManifestOptions
type VitePWAOptions = import ('vite-plugin-pwa').VitePWAOptions

type Plugin = import('vite').Plugin
type ViteServerOptions = import('vite').ServerOptions

const getAbsolutePath = (root: string, path: string) => isAbsolute(path) ? path : join(root, path)

// Run a development server
export const createServer = async (config: ResolvedConfig, opts: ServerOptions)  => {

    const _vite = await vite
    const _chalk = await chalk

    
    // Create the frontend server
    const server = await _vite.createServer(await resolveViteConfig(config, {}, false))
    await server.listen()

    // Print out the URL if everything was initialized here (i.e. dev mode)
    if (opts.printUrls !== false) {
        const { port, host } = server.config.server;
        const protocol = server.config.server.https ? 'https' : 'http';
        const url = `${protocol}://${host || 'localhost'}:${port}`;
        await printServiceMessage('Commoners Development Server', _chalk.cyanBright(url))
    }

    return server
}

type PWAOptions = {
    icon: ResolvedConfig['icon'],
    name: ResolvedConfig['name'],
    appId: ResolvedConfig['appId'],
    description: ResolvedConfig['description'],
    root: ResolvedConfig['root']
}


const resolvePWAOptions = (opts = {}, { name, description, appId, icon, root }: PWAOptions, outDir: string) => {

    const pwaOpts = { ...opts } as Partial<VitePWAOptions>


    if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []
    else if (!Array.isArray(pwaOpts.includeAssets)) pwaOpts.includeAssets = [ pwaOpts.includeAssets ]
    
    // Only include preferred icons
    const icons = getAllIcons(icon).map((src: string) => relative(outDir, getAssetBuildPath(getAbsolutePath(root, src), outDir)))
    pwaOpts.includeAssets.push(...icons.map(safePath)) // Include specified assets

    const baseManifest = {
        id: `?${appId}=1`,

        start_url: '.',

        theme_color: '#ffffff', // copy.design?.theme_color ?? 
        background_color: "#fff",
        display: 'standalone',

        // Dynamic
        name,
        short_name: name,
        description,

        // Generated
        icons: icons.map(src => {
            return {
                src: safePath(src),
                type: `image/${extname(src).slice(1)}`,
                sizes: 'any'
            }
        })
    } as Partial<ManifestOptions>

    pwaOpts.manifest = ('manifest' in pwaOpts) ? { ...baseManifest, ...pwaOpts.manifest } : baseManifest // Naive merge

    return pwaOpts as ResolvedConfig['pwa']
}

export const resolveViteConfig = async (
    commonersConfig: ResolvedConfig, 
    { dev = true }: ViteOptions, 
    build = true
) => {

    const _vite = await vite
    let { vite: viteUserConfig = {}, target, outDir, port, public: isPublic } = commonersConfig

    const isDesktopTarget = isDesktop(target)

    if (typeof viteUserConfig === 'string') viteUserConfig = (await _vite.loadConfigFromFile({ command: build ? 'build' : 'serve', mode: build ? 'production' : 'development' }, viteUserConfig)).config
    
    const plugins: Plugin[] = [ ]

    const { name, appId, root, icon, description, pages = {}, plugins: commonersPlugins } = commonersConfig
    
    // Desktop Build
    if (isDesktopTarget) {
        const plugin = await electronPlugin({ build, root, outDir })
        plugins.push(...plugin)
    } 
    
    // PWA Build
    else if (target === 'pwa') {
        
        const opts = resolvePWAOptions(commonersConfig.pwa, {
            name,
            appId,
            icon,
            description,
            root
        }, outDir)

        const VitePWAPlugin = await import('vite-plugin-pwa').then(m => m.VitePWA)

        // @ts-ignore
        plugins.push(...VitePWAPlugin({ registerType: 'autoUpdate',  ...opts }))
    }


    // Get html files from plugins
    const pluginPages = Object.values(commonersPlugins).reduce(( acc, plugin ) => {
        Object.values(plugin.assets ?? {}).forEach((assetSrc) => {
            if (extname(assetSrc) === '.html') acc[crypto.randomUUID()] = getAbsolutePath(root, assetSrc)
        })
        return acc
    }, {}) as Record<string, string>

    const collectedPages = { ...pages, ...pluginPages }

    const rollupOptions = {}

    // Resolve pages
    if (Object.keys(collectedPages).length) {
        const rootHTML = getAbsolutePath(root, 'index.html')
        const allPages = Object.values(collectedPages)
        if (allPages.length) {
            if (!allPages.includes(rootHTML)) allPages.push(rootHTML)
            const allUniquePages = Array.from(new Set(allPages))
            rollupOptions.input = allUniquePages.reduce(( acc, filepath ) => {
                acc[crypto.randomUUID()] = filepath
                return acc
            }, {}) 
        }
    }

    const serverConfig = { 
        port, 
        open: !isDesktopTarget && !process.env.VITEST // Open the browser unless testing / building for desktop
    } as ViteServerOptions

    if (isPublic) serverConfig.host = '0.0.0.0'

    // Define a default set of plugins and configuration options
    const viteConfig = _vite.defineConfig({
        logLevel: dev ? 'silent' : 'info',
        base: './',
        root, // Resolve index.html from the root directory
        build: {
            emptyOutDir: false,
            outDir,
            rollupOptions
        },
        plugins,
        server: serverConfig, // Open the browser unless testing / building for desktop
        clearScreen: false,
        envPrefix: ["VITE_", "COMMONERS_"]
    })

    const mergedConfig = _vite.mergeConfig(viteConfig, viteUserConfig)

    const mode = dev ? "development" : "production"
    const env = _vite.loadEnv(mode, root, mergedConfig.envPrefix)

    mergedConfig.plugins = [
        ...mergedConfig.plugins,
        commonersPlugin({ 
            config: {
                ...commonersConfig,
                vite: mergedConfig
            }, 
            build,
            dev,
            env
        })
    ]
    
    return mergedConfig
}
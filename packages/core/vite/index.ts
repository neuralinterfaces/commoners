// Built-In Modules
import { extname, isAbsolute, join, relative } from 'node:path'

// General Internal Imports
import { rootDir, isDesktop, vite, chalk } from "../globals.js";
import { ResolvedConfig, ServerOptions, ViteOptions } from '../types.js'

// Internal Plugins
import electronPlugin from './plugins/electron/index.js'
import commonersPlugin from './plugins/commoners.js'

// Internal Imports
import { getIcon, safePath } from '../utils/index.js';
import { printServiceMessage } from '../utils/formatting.js';
import { getAssetBuildPath } from '../utils/assets.js';

type ManifestOptions = import ('vite-plugin-pwa').ManifestOptions
type VitePWAOptions = import ('vite-plugin-pwa').VitePWAOptions

type Plugin = import('vite').Plugin

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
    
    const icons = []
    const rawIconSrc = getIcon(icon)
    if (rawIconSrc) {
        const defaultIcon = getAbsolutePath(root, rawIconSrc)
        const iconBuildPath = getAssetBuildPath(defaultIcon, outDir)
        icons.push(relative(outDir, iconBuildPath)) // Use the relative path for builds
    }

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
    let { vite: viteUserConfig = {}, target, outDir, port, host } = commonersConfig

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
    for (const [id, plugin] of Object.entries(commonersPlugins)) {
        Object.entries(plugin.assets ?? {}).map(([key, fileInfo]) => {
            const fileInfoDictionary = typeof fileInfo === 'string' ? { src: fileInfo } : fileInfo
            const { src } = fileInfoDictionary
            if (extname(src) === '.html') pages[`_plugins/${id}/${key}`] = src
        })
    }

    const rollupOptions = {}

    // Resolve pages
    if (Object.keys(pages).length) {

        const rootHTML = getAbsolutePath(root, 'index.html')
        const hasIndexPage = Object.values(pages).find(page => getAbsolutePath(root, page) === rootHTML)

        rollupOptions.input = Object.entries(pages).reduce((acc, [name, filepath]) => {
            acc[name] = getAbsolutePath(root, filepath)
            return acc
        }, {}) 

        // Must specify the root index page
        if (!hasIndexPage) rollupOptions.input[crypto.randomUUID()] = rootHTML
    }

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
        server: { port, host, open: !isDesktopTarget && !process.env.VITEST }, // Open the browser unless testing / building for desktop
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
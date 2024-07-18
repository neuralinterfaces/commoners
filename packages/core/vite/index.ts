import { Plugin } from 'vite'
import ElectronVitePlugin from 'vite-plugin-electron/simple'
import { ManifestOptions, VitePWA, VitePWAOptions } from 'vite-plugin-pwa'

import { extname, join, resolve } from 'node:path'

import { rootDir, isDesktop, chalk, vite } from "../globals.js";

import commonersPlugin from './plugins/commoners.js'
import { ResolvedConfig, ServerOptions, ViteOptions } from '../types.js'
import { safePath } from '../utils/index.js';


// import { nodeBuiltIns } from "../utils/config.js";

const defaultOutDir = join(rootDir, 'dist')

// Run a development server
export const createServer = async (config: ResolvedConfig, opts: ServerOptions = { outDir: defaultOutDir })  => {

    const _vite = await vite

    // Create the frontend server
    const server = await _vite.createServer(await resolveViteConfig(config, opts, false))
    await server.listen()

    // Print out the URL if everything was initialized here (i.e. dev mode)
    if (opts.printUrls !== false) {
        console.log('\n')
        server.printUrls()
        console.log('\n')
    }

    return server
}


type PWAOptions = {
    icon: ResolvedConfig['icon'],
    name: ResolvedConfig['name'],
    appId: ResolvedConfig['appId'],
    description: ResolvedConfig['description']
}

const resolvePWAOptions = (opts = {}, { name, description, appId, icon }: PWAOptions) => {

    const pwaOpts = { ...opts } as Partial<VitePWAOptions>


    if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []
    else if (!Array.isArray(pwaOpts.includeAssets)) pwaOpts.includeAssets = [ pwaOpts.includeAssets ]

    const icons = icon ? (typeof icon === 'string' ? [ icon ] : Object.values(icon)) : []

    pwaOpts.includeAssets.push(...icons.map(safePath)) // Include specified assets

    const baseManifest = {
        id: `?${appId}=1`,

        start_url: '.',

        theme_color: '#ffffff', // copy.design?.theme_color ?? 
        background_color: "#fff",
        display: 'standalone',

        // Dynamic
        name,
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
    { 
        target, 
        outDir,
        dev = true
    }: ViteOptions, 
    build = true
) => {

    const _vite = await vite

    const _chalk = await chalk

    const isDesktopTarget = isDesktop(target)

    let { vite: viteUserConfig = {} } = commonersConfig
    if (typeof viteUserConfig === 'string') viteUserConfig = (await _vite.loadConfigFromFile({ command: build ? 'build' : 'serve', mode: build ? 'production' : 'development' }, viteUserConfig)).config
    
    const plugins: Plugin[] = [ ]

    const { name, appId, root, icon, description, dependencies = {} } = commonersConfig

    // Desktop Build
    if (isDesktopTarget) {

        const electronTemplateBase = join(rootDir, 'templates', 'electron')

        const viteOpts = {
            logLevel: 'silent',
            build: {
                // sourcemap: !build,
                minify: build,
                outDir,
                rollupOptions: {
                    external: Object.keys(dependencies),
                }
            }
        }

        // @ts-ignore
        const electronPluginConfig = ElectronVitePlugin({
            main: {
              entry: resolve(electronTemplateBase, 'main.ts'),
              onstart: (options) => options.startup(),              
              vite: viteOpts
            },
            preload: {
              input: resolve(electronTemplateBase, 'preload.ts'),
              onstart: (options) => options.reload(), // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, instead of restarting the entire Electron App.
              vite: viteOpts
            },
        }
    )

        plugins.push(electronPluginConfig)

    } 
    
    // PWA Build
    else if (target === 'pwa') {
        
        const opts = resolvePWAOptions(commonersConfig.pwa, {
            name,
            appId,
            icon,
            description
        })

        // @ts-ignore
        plugins.push(...VitePWA({ registerType: 'autoUpdate',  ...opts }))
    }

    console.log(`\n👊 Running ${_chalk.bold(_chalk.cyanBright('vite'))}\n`)

    // Define a default set of plugins and configuration options
    const viteConfig = _vite.defineConfig({
        base: './',
        root, // Resolve index.html from the root directory
        build: {
            emptyOutDir: false,
            outDir
        },
        plugins,
        server: { open: !isDesktopTarget && !process.env.VITEST }, // Open the browser unless testing / building for desktop
        clearScreen: false,
    })



    const mergedConfig = _vite.mergeConfig(viteConfig, viteUserConfig)

    mergedConfig.plugins = [
        ...mergedConfig.plugins,
        commonersPlugin({ 
            config: {
                ...commonersConfig,
                vite: mergedConfig
            }, 
            build,
            outDir,
            target,
            dev
        })
    ]
    
    return mergedConfig
}
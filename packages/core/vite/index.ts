import * as vite from 'vite'

import electron from 'vite-plugin-electron'
import { ManifestOptions, VitePWA, VitePWAOptions } from 'vite-plugin-pwa'

import { extname, join, resolve, sep } from 'node:path'

import { rootDir, userPkg, getScopedOutDir, NAME, APPID, getAssetOutDir, defaultOutDir } from "../globals.js";

import commonersPlugin from './plugins/commoners.js'
import { ResolvedConfig, ServerOptions, UserConfig, ViteOptions } from '../types.js'
import { loadConfigFromFile, resolveConfig } from '../index.js'

// Run a development server
export const createServer = async (config: UserConfig | ResolvedConfig | string, opts: ServerOptions = {})  => {

    if (typeof config === 'string')  config = await loadConfigFromFile(config)
    const resolvedConfig = await resolveConfig(config)

    // Create the frontend server
    const server = await vite.createServer(resolveViteConfig(resolvedConfig, opts, false))
    await server.listen()

    // Print out the URL if everything was initialized here (i.e. dev mode)
    if (opts.printUrls !== false) {
        console.log('\n')
        server.printUrls()
        console.log('\n')
    }
}


type PWAOptions = {
    icon: UserConfig['icon'],
    outDir: string
}

const resolvePWAOptions = (opts = {}, { icon, outDir }: PWAOptions) => {

    const pwaOpts = { ...opts } as Partial<VitePWAOptions>

    if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []
    else if (!Array.isArray(pwaOpts.includeAssets)) pwaOpts.includeAssets = [ pwaOpts.includeAssets ]

    const fromHTMLPath = join(...getAssetOutDir(outDir).split(sep).slice(1))
    const icons = icon ? (typeof icon === 'string' ? [ icon ] : Object.values(icon)).map(str => join(fromHTMLPath, str)) : [] // Provide full path of the icon

    console.log('Icons', icons)

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

    return pwaOpts as ResolvedConfig['pwa']
}

export const resolveViteConfig = (
    commonersConfig: ResolvedConfig, 
    { 
        target, 
        outDir = defaultOutDir 
    }: ViteOptions = {}, 
    build = true
) => {

    const isDesktop = target === 'desktop'
    
    const plugins: vite.Plugin[] = [ commonersPlugin({ 
        config: commonersConfig, 
        build,
        TARGET: target,
        MODE: process.env.COMMONERS_MODE ?? 'development'
    })]

    // Desktop Build
    if (isDesktop) {

        const electronTemplateBase = join(rootDir, 'templates', 'electron')

        const viteOpts = {
            logLevel: 'silent',
            build: {
                // sourcemap: !build,
                minify: build,
                outDir: getScopedOutDir(outDir),
                rollupOptions: {
                    external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                }
            }
        }

        const electronPluginConfig = electron([
            {
                entry: resolve(electronTemplateBase, 'main.ts'),
                onstart: (options) => options.startup(),
                vite: viteOpts
            },
            {
                entry: resolve(electronTemplateBase, 'preload.ts'),
                onstart: (options) => options.reload(), // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, instead of restarting the entire Electron App.
                vite: viteOpts
            }
        ])

        plugins.push(electronPluginConfig)

    } 
    
    // PWA Build
    else if (target === 'pwa') {
        
        const opts = resolvePWAOptions(commonersConfig.pwa, {
            icon: commonersConfig.icon,
            outDir: outDir
        })

        plugins.push(VitePWA({ registerType: 'autoUpdate',  ...opts }))
    }

    // Define a default set of plugins and configuration options
    return vite.defineConfig({
        base: './',
        build: {
            emptyOutDir: false,
            outDir
        },
        plugins,
        server: { open: !isDesktop },
        clearScreen: false,
    })
}
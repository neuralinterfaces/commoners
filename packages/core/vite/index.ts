import * as vite from 'vite'

import ElectronVitePlugin from 'vite-plugin-electron'
import { ManifestOptions, VitePWA, VitePWAOptions } from 'vite-plugin-pwa'

import { extname, join, resolve, sep } from 'node:path'

import { rootDir, userPkg, NAME, APPID, isDesktop } from "../globals.js";

import commonersPlugin from './plugins/commoners.js'
import { ResolvedConfig, ServerOptions, IconType, ViteOptions } from '../types.js'
import chalk from 'chalk';

const defaultOutDir = join(rootDir, 'dist')

// Run a development server
export const createServer = async (config: ResolvedConfig, opts: ServerOptions = { outDir: defaultOutDir })  => {

    // Create the frontend server
    const server = await vite.createServer(resolveViteConfig(config, opts, false))
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
    icon: IconType,
    outDir: string
}

const resolvePWAOptions = (opts = {}, { icon, outDir }: PWAOptions) => {

    const pwaOpts = { ...opts } as Partial<VitePWAOptions>

    if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []
    else if (!Array.isArray(pwaOpts.includeAssets)) pwaOpts.includeAssets = [ pwaOpts.includeAssets ]

    const fromHTMLPath = join(...outDir.split(sep).slice(1))

    const icons = icon ? (typeof icon === 'string' ? [ icon ] : Object.values(icon)).map(str => join(fromHTMLPath, str)) : [] // Provide full path of the icon

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
        outDir 
    }: ViteOptions, 
    build = true
) => {

    const isDesktopTarget = isDesktop(target)
    
    const plugins: vite.Plugin[] = [ commonersPlugin({ 
        config: commonersConfig, 
        build,
        outDir,
        target
    })]

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
                    external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                }
            }
        }

        // @ts-ignore
        const electronPluginConfig = ElectronVitePlugin([
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

        // @ts-ignore
        plugins.push(...VitePWA({ registerType: 'autoUpdate',  ...opts }))
    }

    console.log(`\n👊 Compiling frontend with ${chalk.bold(chalk.cyanBright('vite'))}\n`)

    // Define a default set of plugins and configuration options
    return vite.defineConfig({
        base: './',
        root: commonersConfig.root, // Resolve index.html from the root directory
        build: {
            emptyOutDir: false,
            outDir
        },
        plugins,
        server: { open: !isDesktopTarget && !process.env.VITEST }, // Open the browser unless testing / building for desktop
        clearScreen: false,
    })
}
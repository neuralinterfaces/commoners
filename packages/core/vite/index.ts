import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { ManifestOptions, VitePWA, VitePWAOptions } from 'vite-plugin-pwa'

import { extname, join, sep } from 'node:path'

import { rootDir, userPkg, scopedOutDir, outDir, NAME, APPID, assetOutDir } from "../globals.js";

import commonersPlugin from './plugins/commoners.js'
import { ResolvedConfig, UserConfig } from '../types.js'

type Options = {
    electron?: boolean,
    pwa?: boolean
}

const resolvePWAOptions = (opts = {}, { icon }: UserConfig) => {

    const pwaOpts = { ...opts } as Partial<VitePWAOptions>

    if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []
    else if (!Array.isArray(pwaOpts.includeAssets)) pwaOpts.includeAssets = [ pwaOpts.includeAssets ]

    const fromHTMLPath = join(...assetOutDir.split(sep).slice(1))
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

export const resolveViteConfig = (commonersConfig = {}, opts: Options = {}, build = true) => {

    const withElectron = opts.electron
    
    const pwa = resolvePWAOptions(opts.pwa, commonersConfig)
    
    const plugins: vite.Plugin[] = [ commonersPlugin({ config: commonersConfig, build })]

    if (build && pwa) plugins.push(VitePWA({ registerType: 'autoUpdate',  ...commonersConfig.pwa }))

    if (withElectron) {

        const electronTemplateBase = join(rootDir, 'templates', 'electron')

        const viteOpts = {
            logLevel: 'silent',
            build: {
                // sourcemap: !build,
                minify: build,
                outDir: scopedOutDir,
                rollupOptions: {
                    external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                }
            }
        }


        const electronPluginConfig = electron([
            {
                entry: join(electronTemplateBase, 'main.ts'),
                onstart: (options) => options.startup(),
                vite: viteOpts
            },
            {
                entry: join(electronTemplateBase, 'preload.ts'),
                onstart: (options) => options.reload(), // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, instead of restarting the entire Electron App.
                vite: viteOpts
            }
        ])

        plugins.push(electronPluginConfig)

        // NOTE: Remove?
        plugins.push(renderer()) // Use Node.js API in the Renderer-process
    }

    // Define a default set of plugins and configuration options
    return vite.defineConfig({
        base: './',
        build: {
            emptyOutDir: false,
            outDir
        },
        plugins,
        server: { open: !withElectron },
        clearScreen: false,
    })
}
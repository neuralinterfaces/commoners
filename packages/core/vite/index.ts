import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

import { join } from 'node:path'

import { rootDir, userPkg, scopedOutDir, target, command, cliArgs, outDir } from "../globals.js";

import commonersPlugin from './plugins/commoners.js'

export const resolveViteConfig = (commonersConfig = {}, opts = {}) => {

    const withElectron = ('electron' in opts) ? opts.electron : target.desktop
    const build = ('build' in opts) ? opts.build : command.build
    const pwa = ('pwa' in opts) ? opts.pwa : cliArgs.pwa

    const sourcemap = !build    
    
    const plugins: vite.Plugin[] = [ commonersPlugin({ config: commonersConfig, build })]

    if (build && pwa) plugins.push(VitePWA({ registerType: 'autoUpdate',  ...commonersConfig.pwa }))

    if (withElectron) {

        const electronTemplateBase = join(rootDir, 'packages', 'core', 'templates', 'electron')

        const viteOpts = {
            logLevel: 'silent',
            build: {
                sourcemap,
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
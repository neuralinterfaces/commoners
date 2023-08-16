import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

import { join } from 'node:path'

import { rootDir, userPkg, scopedOutDir } from "../../globals.js";

export const resolveConfig = (commonersConfig = {}, { electron: withElectron, pwa, build} = {}) => {

    const sourcemap = !build    
    
    const config = { ...commonersConfig }
    
    if (!build) config.services = JSON.parse(process.env.COMMONERS_SERVICES) // Provide the sanitized service information

    const plugins = [
        {
            name: 'commoners',
            transformIndexHtml(html) {

                // Run commoners plugins after everything has loaded
                const electronScript = withElectron ? `<script>

                    if (globalThis.electron) {
                        const { plugins } = globalThis.commoners

                        if (plugins) {
                            const { __toRender, loaded } = plugins
                            delete plugins.__toRender
                            const rendered = plugins.rendered = {}
                            for (let name in __toRender) rendered[name] = __toRender[name](loaded[name])
                        }
                    }
                </script>` : ''

                const webBuildScript = build ? '' : `<script>globalThis.commoners = JSON.parse('${JSON.stringify(config)}');</script>`

                return `${webBuildScript}\n${html}\n${electronScript}`
            },
        },
    ]

    if (pwa && build) {

        const pwaOptions = { 
            registerType: 'autoUpdate',
            ...config.pwa 
        }

        // NOTE: On page reloads, this makes the service worker unable to find the index.html file...
        // if (!build) {
        //     const devOpts = ('devOptions' in pwaOptions) ? pwaOptions.devOptions : pwaOptions.devOptions = {}
        //     if (devOpts.enabled !== false) devOpts.enabled = true
        // }

        plugins.push(VitePWA(pwaOptions))
    }

    if (withElectron) {

        const electronPluginConfig = electron([
            {
                // Main-Process entry file of the Electron App.
                entry: join(rootDir, 'template/src/main/index.ts'),
                onstart: (options) => options.startup(),
                vite: {
                    logLevel: 'silent',
                    build: {
                        sourcemap,
                        minify: build,
                        outDir: join(scopedOutDir, 'main'),
                        rollupOptions: {
                            external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                        },
                    },
                },
            },
            {
                entry: join(rootDir, 'template/src/preload/index.ts'),
                onstart: (options) => options.reload(), // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, instead of restarting the entire Electron App.
                vite: {
                    logLevel: 'silent',
                    build: {
                        sourcemap: sourcemap ? 'inline' : undefined, // #332
                        minify: build,
                        outDir: join(scopedOutDir, 'preload'),
                        rollupOptions: {
                            external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                        },
                    },
                },
            }
        ])

        plugins.push(electronPluginConfig)
        plugins.push(renderer()) // Use Node.js API in the Renderer-process
    }

    return vite.mergeConfig(

        // Define a default set of plugins and configuration options
        vite.defineConfig({
            base: './',
            plugins,
            server: { open: !withElectron },
            clearScreen: false,
        }), 

        commonersConfig.vite ?? {} // Merge in the user configuration provided
    )
}
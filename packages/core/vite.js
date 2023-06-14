import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

import { join } from 'node:path'

import { rootDir, userPkg, baseOutDir } from "../../globals.js";
import commonersPlugins from '../plugins/index.js';

export const resolveConfig = (commonersConfig = {}, { electron: withElectron, build}) => {

    const sourcemap = !build    
    
    const config = { ...commonersConfig }
    
    if (!build) config.services = JSON.parse(process.env.COMMONERS_SERVICES) // Provide the sanitized service information

    const plugins = [
        {
            name: 'commoners',
            transformIndexHtml(html) {

                // Insert COMMONERS Electron Polyfills after everything has loaded
                const configPlugins = commonersConfig.plugins ?? []

                const electronScript = withElectron ? `<script>

                    if (globalThis.electron) {
                        const plugins = globalThis.commoners.plugins

                        if (plugins) {
                            [
                                ${commonersPlugins.filter(o => 'renderer' in o && o.name in configPlugins).map(o => o.renderer.toString()).join(',\n')}
                            ].forEach(f => f.call(plugins))
                        }
                    }
                </script>` : ''

                const webBuildScript = build ? '' : `<script>globalThis.commoners = JSON.parse('${JSON.stringify(config)}');</script>`

              return`${webBuildScript}\n${html}\n${electronScript}`
            },
        },
    ]

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
                        outDir: join(baseOutDir, 'main'),
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
                        outDir: join(baseOutDir, 'preload'),
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
            plugins,
            server: { open: !withElectron },
            clearScreen: false,
        }), 

        commonersConfig.vite ?? {} // Merge in the user configuration provided
    )
}
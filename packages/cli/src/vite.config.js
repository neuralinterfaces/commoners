import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

import { join } from 'node:path'

import { __dirname, userPkg, baseOutDir } from "../globals.js";

export const resolveConfig = (command) => {

    const isServe = command === 'serve' || command === 'dev'
    const isBuild = command === 'build'
    const sourcemap = isServe

    return vite.defineConfig({

        plugins: [
            electron([
                {
                    // Main-Process entry file of the Electron App.
                    entry: join(__dirname, '..', '..', 'template/src/main/index.ts'),
                    onstart: (options) => options.startup(),
                    vite: {
                        logLevel: 'silent',
                        build: {
                            sourcemap,
                            minify: isBuild,
                            outDir: join(baseOutDir, 'main'),
                            rollupOptions: {
                                external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                            },
                        },
                    },
                },
                {
                    entry: join(__dirname, '..', '..', 'template/src/preload/index.ts'),
                    onstart: (options) => options.reload(), // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, instead of restarting the entire Electron App.
                    vite: {
                        logLevel: 'silent',
                        build: {
                            sourcemap: sourcemap ? 'inline' : undefined, // #332
                            minify: isBuild,
                            outDir: join(baseOutDir, 'preload'),
                            rollupOptions: {
                                external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                            },
                        },
                    },
                }
            ]),

            // Use Node.js API in the Renderer-process
            renderer(),
        ],

        clearScreen: false,
    })
}
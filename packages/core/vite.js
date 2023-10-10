import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

import { join, normalize, extname } from 'node:path'

import { rootDir, userPkg, scopedOutDir, target, command, cliArgs, outDir } from "./globals";
import { getIcon } from './utils/index'

export const resolveViteConfig = (commonersConfig = {}, opts = {}) => {

    const withElectron = ('electron' in opts) ? opts.electron : target.desktop
    const build = ('build' in opts) ? opts.build : command.build
    const pwa = ('pwa' in opts) ? opts.pwa : cliArgs.pwa

    const sourcemap = !build    
    
    const config =  { ... commonersConfig }

    // Sanitize the global configuration object
    const icon = getIcon(config.icon)

    function assetPath(path) {
        return `./${normalize(`${build ? '' : 'dist/'}.commoners/assets/${path}`)}`
    }

    const plugins = [
        {
            name: 'commoners',
            transformIndexHtml(html) {
return `
${
    icon ? `<link rel="shortcut icon" href="${assetPath(icon)}" type="image/${extname(icon).slice(1)}" >` : '' // Add favicon
}
<script type="module">

    // Directly import the plugins from the transpiled configuration object
    import COMMONERS_CONFIG from "${assetPath('commoners.config.mjs')}"
    const { plugins } = COMMONERS_CONFIG

    // Set global variable
    const { services, ipcRenderer } = globalThis.__COMMONERS ?? {} // Grab temporary variables

    globalThis.COMMONERS = JSON.parse(\`${JSON.stringify({
        services: JSON.parse(process.env.COMMONERS_SERVICES),
        TARGET: process.env.COMMONERS_TARGET,
        PLATFORM: process.env.COMMONERS_PLATFORM,
        MODE: process.env.COMMONERS_MODE
    })}\`)

    if (plugins) globalThis.COMMONERS.__plugins = plugins
    if (services) globalThis.COMMONERS.services = services // Replace with sanitized services from Electron if available

    COMMONERS.ready = new Promise(res => {
        const ogRes = res
        res = (...args) => {
            ogRes(...args)
            delete COMMONERS.__ready
            if (ipcRenderer) ipcRenderer.send('COMMONERS:ready')
        }
        
        COMMONERS.__ready = res
    })    

    import("${assetPath('onload.mjs')}")

</script>
\n${html}`
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
                            external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {})
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
            build: {
                emptyOutDir: false,
                outDir
            },
            plugins,
            server: { open: !withElectron },
            clearScreen: false,
        }), 

        commonersConfig.vite ?? {} // Merge in the user configuration provided
    )
}
import * as vite from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { VitePWA } from 'vite-plugin-pwa'

import { join, normalize } from 'node:path'

import { rootDir, userPkg, scopedOutDir, target, command, cliArgs, TARGET } from "./globals";
import { getIcon } from './utils/index'

export const resolveViteConfig = (commonersConfig = {}, opts = {}) => {

    const withElectron = ('electron' in opts) ? opts.electron : target.desktop
    const build = ('build' in opts) ? opts.build : command.build
    const pwa = ('pwa' in opts) ? opts.pwa : cliArgs.pwa

    const sourcemap = !build    
    
    const config =  { ... commonersConfig }

    // Add extra global state variables

    // Sanitize the global configuration object
    const icon = getIcon(config.icon)

    const plugins = [
        {
            name: 'commoners',
            transformIndexHtml(html) {
return `
${
    icon ? `<link rel="icon" type="image/x-icon" href="./${normalize(icon)}">` : '' // Add favicon
}
<script type="module">

    // Directly import the plugins from the transpiled configuration object
    import COMMONERS_CONFIG from "./${true ? 'dist/' : ''}.commoners/assets/commoners.config.mjs"
    const { plugins } = COMMONERS_CONFIG

    // Set global variable
    const { ipcRenderer, services } = globalThis.__COMMONERS // Grab temporary variables

    globalThis.COMMONERS = JSON.parse(\`${JSON.stringify({
        services: JSON.parse(process.env.SERVICES),
        TARGET: process.env.TARGET,
        PLATFORM: process.env.PLATFORM,
        MODE: process.env.MODE
    })}\`)

    if (services)  globalThis.COMMONERS.services = services // Replace with sanitized services from Electron if available

    // Injected environment from the COMMONERS build process
    const pluginErrorMessage = (name, type, e) => console.error(\`[commoners] \${name} plugin (\${type}) failed to execute:\`, e)

    const removablePluginProps = ['preload', 'render']

    const sanitizePluginProperties = (plugin, target) => {
        const copy = {...plugin}

        const assumeRemoval = 'main' in copy && target !== 'desktop' // Always clear main when not an electron build

        if (assumeRemoval) delete copy.main 

        // Assume true if no main; assume false if main
        const willRemove = (v) => assumeRemoval ? !v : v === false

        // Remove any top-level properties that are flagged as unsupported
        const isSupported = copy.isSupported?.[target] ?? copy.isSupported // Drill to the target

        if (isSupported && typeof isSupported === 'object') {
            let { properties } = isSupported

            if (!isSupported.check) properties = isSupported // isSupported is the property dictionary

            if (willRemove(properties)) {
                properties = isSupported.properties = {}
                removablePluginProps.forEach(prop => properties[prop] = false)
            }
            
            if (properties && typeof properties === 'object') removablePluginProps.forEach(prop => {
                if (willRemove(properties[prop])) delete copy[prop]
            })
        }

        return copy
    }

    const pluginsResolved = new Promise(async (resolve, reject) => {

        const loaded = {}
        const __toRender = {}
        if (plugins) {

            const getFnFromString = (str) => (0, eval)(\`(\${str})\`)
    
            // https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
            const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));
    
            const supported = await asyncFilter(plugins, async (plugin) => {
                try {
                    let { isSupported } = plugin
                    if (isSupported && typeof isSupported === 'object') isSupported = isSupported[COMMONERS.TARGET]
                    if (typeof isSupported?.check === 'function') isSupported = isSupported.check
                    return (typeof isSupported === 'function') ? await isSupported.call(plugin, COMMONERS.TARGET) : isSupported !== false
                } catch {
                    return false
                }
            })

            const sanitized = supported.map((o) => sanitizePluginProperties(o, COMMONERS.TARGET))
    
            sanitized.forEach(({ name, preload }) => {
                
                loaded[name] = undefined // Register that all supported plugins are technically loaded
    
                try {
                    if (preload) loaded[name] = ipcRenderer ? preload.call(ipcRenderer) : preload()
                } catch (e) {
                    pluginErrorMessage(name, "preload", e)
                }
    
            })
        
            sanitized.forEach(({ name, render }) => {
                if (render) __toRender[name] = render
            })
        }
    
        COMMONERS.plugins = { loaded, __toRender }
        resolve()
    })

    document.addEventListener("DOMContentLoaded", async function(){

        await pluginsResolved
        const { plugins } = COMMONERS
        
        // Handle Preloaded Plugin Values
        const { __toRender = {}, loaded } = plugins
        delete plugins.__toRender
        const rendered = plugins.rendered = {}
        for (let name in __toRender) {
            try {
                rendered[name] = __toRender[name](loaded[name])
            } catch (e) {
                pluginErrorMessage(name, "render", e)
            }
        }
    });
</script>\n${html}`
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
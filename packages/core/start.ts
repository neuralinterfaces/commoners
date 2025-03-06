// Built-In Modules
import { basename, extname, join } from "node:path";

// Internal Imports
import { build, buildServices, configureForDesktop, createServices, resolveConfig } from './index.js'
import { globalTempDir, handleTemporaryDirectories, isDesktop, isMobile } from "./globals.js";
import { onCleanup } from './cleanup.js'

import { Plugin, ResolvedConfig, UserConfig } from "./types.js";
import { createServer } from "./vite/index.js";

// Internal Utilities
import { printHeader, printTarget } from "./utils/formatting.js"
import { buildAllAssets } from "./build.js";
import { runAppPlugins } from './assets/plugins/index.js'
import { getFreePorts } from "./assets/services/network.js";

const wsPortEnvVar = 'COMMONERS_WEBSOCKET_PORT'

const wsContexts = {
    plugins: {
        callbacks: {}
    }
}

const createAllServices = (services, { root, target }) => createServices(services, { root, target, services: true, build: false }) // Run services in parallel

const initializeWebsocketPort = async () => {
    const { env } = process
    return env[wsPortEnvVar] || ( env[wsPortEnvVar] = (await getFreePorts(1))[0]) // Initialize WebSocket Development Server
}

const runDevelopmentPlugins = async (
    config: ResolvedConfig
) => {

    const { target, services } = config
    const { env } = process

    // Copy plugins to allow for modification when assigned as modules
    const plugins = Object.entries({...(config.plugins || {})}).reduce((acc, [name, plugin]) => {
        acc[name] = { ...plugin }
        return acc
    }, {}) as Record<string, Plugin>

    const { Server } = require("ws") // Ensure node version is imported
    const wss = new Server({ port: env[wsPortEnvVar] })
    onCleanup(() => wss.close()) // Close the WebSocket server on exit
    wss.on('connection', ws => {
        ws.on('message', message => {
            const data = JSON.parse(message)
            const { context, id, channel, args } = data
            const matchedContext = wsContexts[context]
            if (!matchedContext) return console.error(`Unknown WS message context: ${context}`)
            const pluginCallbacks = matchedContext.callbacks[id]?.[channel] ?? {}
            const evtObject = {}
            Object.getOwnPropertySymbols(pluginCallbacks).forEach(symbol => pluginCallbacks[symbol](evtObject,...args))
        })
    })


    const isMobileTarget = isMobile(target)

    const targetFlags = {
        MOBILE: isMobileTarget,
        DESKTOP: false,
        WEB: !isMobileTarget
    }
    
    // Create a shared context for the plugin functions
    const boundRunAppPlugins = runAppPlugins.bind({
        env: {
            TARGET: target,
            ...targetFlags,
            DEV: true,
            PROD: false
        },
        plugins, 

        // Simplified plugin context for Web and Mobile
        contexts: Object.entries(plugins).reduce((acc, [ id, { assets = {} }]) => {

            const pluginOnCallbacks = wsContexts.plugins.callbacks[id] = {}

            acc[id] = {
                id,
                ...targetFlags,

                // No electron, utils, createWindow, etc...
                send: (channel, ...args) => wss.clients.forEach(client => client.send(JSON.stringify({ context: "plugins", id, channel, args }))),

                on: (channel, callback) => {
                    const symbol = Symbol()
                    const channelCallbacks = pluginOnCallbacks[channel] = pluginOnCallbacks[channel] || {}
                    channelCallbacks[symbol] = (evtObject, ...args) => callback(evtObject, ...args)
                    return symbol
                },
                plugin: {
                  assets: Object.entries(assets).reduce((acc, [ key, src ]) => {
                    const filename = basename(src)
                    const isHTML = extname(filename) === '.html'
                    if (isHTML) acc[key] = src
                    return acc
                  }, {})
                }
              }
            return acc
        }, {})
    })
    
    onCleanup(() => boundRunAppPlugins([], 'quit')) // Cleanup on exit
    await boundRunAppPlugins([ services ]) // Run the init event before creating services
    const serviceManager = await startServices(config, services)
    const { active } = serviceManager
    await boundRunAppPlugins([ active ], 'ready') // Run the ready event after all services are created
    return serviceManager // Return the active services
}

export const services = async (
    config: UserConfig,
    resolvedServices
) => {

    const dev = true
    const resolvedConfig = await resolveConfig(config);
    const { root, target, services } = resolvedConfig
    await buildServices(resolvedConfig, { services: resolvedServices, dev }) // Build service outputs
    resolvedServices = resolvedServices || services // Use all services if none are provided

    return await createAllServices(resolvedServices, { root, target }) // Create services

}

const startServices = services

export const app = async function ( 
    config: UserConfig
) {
        
        const resolvedConfig = await resolveConfig(config)
        
        const { name, root, target, services } = resolvedConfig

        await printHeader(`${name} — ${printTarget(target)} Development`)

        const outDir = join(root, globalTempDir) // Temporary directory for the build
        const filesystemManager = await handleTemporaryDirectories(outDir)
        const scopedConfig = { ...resolvedConfig, outDir }

        let closed;
        
        const startManager = {
            close: function () {
                filesystemManager.close()
                if (closed) return
                closed = true
                const { frontend, services } = this
                frontend?.close()
                services?.close()
            }
        } as {
            url?: string,
            frontend?: Awaited<ReturnType<typeof createServer>>,
            services?: Awaited<ReturnType<typeof createAllServices>>,
            close: () => void
        }

        onCleanup(() => startManager.close())

        // ------------------------------- Mobile -------------------------------
        if (isMobile(target)) {
            await initializeWebsocketPort()
            await build( scopedConfig, { services, dev: true } ) // Build the frontend and assets for mobile
            startManager.services = await runDevelopmentPlugins(scopedConfig)
            return startManager
        }

        // ------------------------------- Desktop -------------------------------
        if (isDesktop(target)) {
            await buildAllAssets(scopedConfig, true) // Build the assets for desktop
            await configureForDesktop(outDir, root)
            const frontend = startManager.frontend = await createServer(scopedConfig, {  printUrls: false })
            startManager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
            return startManager
        }

        // ------------------------------- Web -------------------------------
        await initializeWebsocketPort()
        await buildAllAssets(scopedConfig, true) // Build the assets for web
        startManager.services = await runDevelopmentPlugins(scopedConfig)
        const frontend = startManager.frontend = await createServer(scopedConfig, {  printUrls: true })
        startManager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
        return startManager
}
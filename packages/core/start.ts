// Built-In Modules
import { basename, extname, join } from "node:path";

// Internal Imports
import { build, buildServices, configureForDesktop, createServices, resolveConfig } from './index.js'
import { globalTempDir, handleTemporaryDirectories, isDesktop, isMobile, onCleanup } from "./globals.js";
import { UserConfig } from "./types.js";
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

export const services = async (
    config: UserConfig,
    resolvedServices
) => {

    const resolvedConfig = await resolveConfig(config);
    const { root, target, services } = resolvedConfig

    // Build service outputs
    await buildServices(resolvedConfig, { services: resolvedServices, dev: true })

    resolvedServices = resolvedServices || services

    // Create services
    return await createAllServices(resolvedServices, { root, target })

}

const startServices = services

export const app = async function ( 
    config: UserConfig
) {
        
        const resolvedConfig = await resolveConfig(config)
        
        const { name, root, target, services } = resolvedConfig

        const isDesktopTarget = isDesktop(target)
        const isMobileTarget = isMobile(target)

        await printHeader(`${name} — ${printTarget(target)} Development`)

        // Temporary directory for the build
        const outDir = join(root, globalTempDir)
        const filesystemManager = await handleTemporaryDirectories(outDir)

        const configCopy = { ...resolvedConfig, outDir }

        const { env } = process
        if (!isDesktopTarget) env[wsPortEnvVar] || ( env[wsPortEnvVar] = (await getFreePorts(1))[0]) // Initialize WebSocket Development Server

        if (isMobileTarget) await build( configCopy, { services, dev: true } ) // Build for mobile before moving forward
        else await buildAllAssets(configCopy, true) // Manually clear and build the output assets

        const activeInstances: {
            frontend?: Awaited<ReturnType<typeof createServer>>,
            services?: Awaited<ReturnType<typeof createAllServices>>
        } = {}

        let closed = false
        const closeFunction = (o) => {

            // If already closed, do nothing
            if (closed) return
            closed = true

            // Close all dependent services
            if (o.frontend) activeInstances.frontend?.close() // Close server first
            if (o.services) activeInstances.services?.close() // Close custom services next
        }

        const manager: {
            url?: string,
            close: typeof closeFunction
        } = {
            close: closeFunction
        }


        // Configure the desktop instance
        if (isDesktopTarget) await configureForDesktop(outDir, root)

        // Create all services
        else {

            // Copy plugins to allow for modification when assigned as modules
            const plugins = Object.entries({...(resolvedConfig.plugins || {})}).reduce((acc, [name, plugin]) => {
                acc[name] = { ...plugin }
                return acc
            }, {})

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

            const targetFlags = {
                MOBILE: isMobileTarget,
                DESKTOP: isDesktopTarget,
                WEB: !isMobileTarget && !isDesktopTarget
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
            const { active } = activeInstances.services = await startServices(configCopy, services)
            await boundRunAppPlugins([ active ], 'ready') // Run the ready event after all services are created
        }

        // Serve the frontend (if not mobile)
        if (!isMobileTarget) {
            const frontend = activeInstances.frontend = await createServer(configCopy, {  printUrls: !isDesktopTarget })
            manager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
        }

        const closeAll = (o) => {
            filesystemManager.close()
            manager.close(o)
        }

        onCleanup(() => {
            closeAll({ services: true, frontend: true }) // Close all services and frontend on exit
        })

        return {
            url: manager.url,
            close: closeAll
        }
}
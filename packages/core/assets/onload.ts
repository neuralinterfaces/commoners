import { removeAllListeners } from "process";
import { asyncFilter, isPluginLoadable, pluginErrorMessage, sanitizePluginProperties } from "./utils";

const TEMP_COMMONERS = globalThis.__commoners ?? {}

// Set global variable
const ENV = commoners
const { __PLUGINS, WEB, DESKTOP, MOBILE, __READY, DEV } = ENV
delete ENV.__PLUGINS

const TARGET = DESKTOP ? 'desktop' : MOBILE ? 'mobile' : 'web'

if ( __PLUGINS ) {

    const devSocketListeners = { plugins: {}}
    const devSocketServer = DEV && !DESKTOP ? new WebSocket(DEV) : null

    // Initialize the WebSocket Development Server
    if (devSocketServer) {

        const devSocketReady = new Promise((resolve) => {
            const ogSend = devSocketServer.send
            devSocketServer.send = async function (data) { await devSocketReady && ogSend.call(this, data) }
            devSocketServer.onopen = () => resolve(true)
        })

        devSocketServer.onerror = function (e) {
            console.error("WebSocket Error:", e)
        }

        devSocketServer.onmessage = async function (message) {
            const data = JSON.parse(message.data)
            const { context, id, channel, args } = data
            const matchingContext = devSocketListeners[context]
            if (!matchingContext) return console.error(`Unknown WS message context: ${context}`)
            const pluginCallbacks = matchingContext[id]?.[channel] ?? {}
            const evtObject = {}
            Object.getOwnPropertySymbols(pluginCallbacks).forEach(symbol => pluginCallbacks[symbol](evtObject,...args))
        }

    }

    const loaded = {}
    
    const pluginLoadedContext = {
        WEB,
        DESKTOP: DESKTOP ? ENV.TARGET : false,
        MOBILE: MOBILE ? ENV.TARGET : false,
        DEV: !!DEV,
        PROD: !DEV,
    }

    const registerPluginAsLoaded = (id) => DESKTOP &&  TEMP_COMMONERS.send(["commoners:loaded", DESKTOP.__id, id].join(":")) // Notify the main process that the plugin is loaded

    asyncFilter(Object.entries(__PLUGINS), async ([ id, plugin ]) => {
        try {

            const supported = await isPluginLoadable.call(
                pluginLoadedContext,
                plugin
            )

            if (!supported) registerPluginAsLoaded(id)

            return supported

        } catch (e) {
            return false
        }
    }).then(supported => {

    const sanitized = supported.map(([id , o]) => {
        const { load } = sanitizePluginProperties(o, TARGET)
        return { id, load }
    })
    
    sanitized.forEach(async ({ id, load }) => {
        
        loaded[id] = undefined // Register that all supported plugins are technically loaded

        const pluginListeners = devSocketListeners["plugins"][id] = {}

        try {

            if (load) {
                const ctx = DESKTOP ? {
                    ...DESKTOP,
                    send: (channel, ...args) => TEMP_COMMONERS.send(`plugins:${id}:${channel}`, ...args),
                    sendSync: (channel, ...args) => TEMP_COMMONERS.sendSync(`plugins:${id}:${channel}`, ...args),
                    on: (channel, listener) => TEMP_COMMONERS.on(`plugins:${id}:${channel}`, listener),
                    once: (channel, listener) => TEMP_COMMONERS.once(`plugins:${id}:${channel}`, listener),
                    removeAllListeners: (channel) => TEMP_COMMONERS.removeAllListeners(`plugins:${id}:${channel}`)
                } : 
                
                // NOTE: Hook up with a custom WebSocket implementation
                {
                    send: (channel, ...args) => devSocketServer && devSocketServer.send(JSON.stringify({ context: "plugins", id, channel, args })),
                    sendSync: false,
                    on: (channel, listener) => {
                        const channelListeners = pluginListeners[channel] = pluginListeners[channel] ?? {}
                        const symbol = Symbol()
                        channelListeners[symbol] = listener
                        return symbol
                    },
                    once: function (channel, listener) {
                        const subscription = this.on(channel, (...args) => {
                            delete pluginListeners[channel]?.[subscription]
                            listener(...args)
                        })
                    },
                    removeAllListeners: (channel) => {
                        delete pluginListeners?.[channel]
                    }
                }

                loaded[id] = load.call(ctx, ENV)
                await loaded[id]
            }

            registerPluginAsLoaded(id)

        } catch (e) {
            pluginErrorMessage(id, "load", e)
        }
    })

    ENV.PLUGINS = loaded
    __READY(loaded)
})

} else {
    __READY({})
}
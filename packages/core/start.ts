// Built-In Modules
import { basename, extname, join } from 'node:path'
import { createRequire } from 'node:module'

// Internal Imports
import {
  build,
  buildServices,
  configureForDesktop,
  createServices,
  resolveConfig,
} from './index.js'
import { globalTempDir, handleTemporaryDirectories, isDesktop, isMobile } from './globals.js'
import { onCleanup } from './cleanup.js'

import { Plugin, ResolvedConfig, UserConfig, HooksInterface } from './types.js'
import { createNoOpHooks } from './ui.js'
import { createServer } from './vite/index.js'

// Internal Utilities
import { runAppPlugins } from './assets/plugins/index.js'
import { getFreePorts } from './assets/services/network.js'

import { startElectronInstance } from './vite/plugins/electron/index.js'
import { buildAssets, getAppAssets } from './utils/assets.js'

const wsPortEnvVar = 'COMMONERS_WEBSOCKET_PORT'

const wsContexts = {
  plugins: {
    callbacks: {},
  },
}

const createAllServices = (services, { root, target, hooks }) =>
  createServices(services, { root, target, services: true, build: false, hooks }) // Run services in parallel

const initializeWebsocketPort = async () => {
  const { env } = process
  return env[wsPortEnvVar] || (env[wsPortEnvVar] = (await getFreePorts(1))[0]) // Initialize WebSocket Development Server
}

const runDevelopmentPlugins = async (config: ResolvedConfig, hooks: HooksInterface) => {
  const { target, services } = config
  const { env } = process

  // Copy plugins to allow for modification when assigned as modules
  const plugins = Object.entries({ ...(config.plugins || {}) }).reduce((acc, [name, plugin]) => {
    acc[name] = { ...plugin }
    return acc
  }, {}) as Record<string, Plugin>

  const require = createRequire(import.meta.url) // Create a require function for dynamic imports
  const { Server } = require('ws') // Import WebSocket server dynamically to avoid bundling issues

  const wss = new Server({ port: env[wsPortEnvVar] })
  onCleanup(() => wss.close()) // Close the WebSocket server on exit
  wss.on('connection', ws => {
    ws.on('message', message => {
      const data = JSON.parse(message)
      const { context, id, channel, args } = data
      const matchedContext = wsContexts[context]

      if (!matchedContext) {
        hooks.emit({
          type: 'dev:server:error',
          error: new Error(`Unknown WS message context: ${context}`)
        })
        return
      }
      const pluginCallbacks = matchedContext.callbacks[id]?.[channel] ?? {}
      const evtObject = {}
      Object.getOwnPropertySymbols(pluginCallbacks).forEach(symbol =>
        pluginCallbacks[symbol](evtObject, ...args)
      )
    })
  })

  const isMobileTarget = isMobile(target)

  const targetFlags = {
    MOBILE: isMobileTarget,
    DESKTOP: false,
    WEB: !isMobileTarget,
  }

  // Create a shared context for the plugin functions
  const boundRunAppPlugins = runAppPlugins.bind({
    env: {
      TARGET: target,
      ...targetFlags,
      DEV: true,
      PROD: false,
    },
    plugins,

    // Simplified plugin context for Web and Mobile
    contexts: Object.entries(plugins).reduce((acc, [id, { assets = {} }]) => {
      const pluginOnCallbacks = (wsContexts.plugins.callbacks[id] = {})

      acc[id] = {
        id,
        ...targetFlags,

        // No electron, utils, createWindow, etc...
        send: (channel, ...args) =>
          wss.clients.forEach(client =>
            client.send(JSON.stringify({ context: 'plugins', id, channel, args }))
          ),

        on: (channel, callback) => {
          const symbol = Symbol()
          const channelCallbacks = (pluginOnCallbacks[channel] = pluginOnCallbacks[channel] || {})
          channelCallbacks[symbol] = (evtObject, ...args) => callback(evtObject, ...args)
          return symbol
        },
        plugin: {
          assets: Object.entries(assets).reduce((acc, [key, src]) => {
            const filename = basename(src)
            const isHTML = extname(filename) === '.html'
            if (isHTML) acc[key] = src
            return acc
          }, {}),
        },
      }
      return acc
    }, {}),
  })

  onCleanup(() => boundRunAppPlugins([], 'quit')) // Cleanup on exit
  await boundRunAppPlugins([services]) // Run the init event before creating services
  const serviceManager = await startServices(config, services, hooks) // Start the services
  const { active } = serviceManager
  await boundRunAppPlugins([active], 'ready') // Run the ready event after all services are created
  return serviceManager // Return the active services
}

export const services = async (config: UserConfig, resolvedServices, hooks: HooksInterface = createNoOpHooks()) => {
  const dev = true
  const resolvedConfig = await resolveConfig(config)
  const { root, target, services } = resolvedConfig
  await buildServices(resolvedConfig, { services: resolvedServices, dev, hooks }) // Build service outputs
  resolvedServices = resolvedServices || services // Use all services if none are provided
  return await createAllServices(resolvedServices, { root, target, hooks }) // Create services
}

const startServices = services

export const app = async function (config: UserConfig, options: { hooks?: HooksInterface } = {}) {

  try {

    const resolvedConfig = await resolveConfig(config, { hooks: options.hooks })
    const hooks = resolvedConfig.hooks

    // Emit dev server start event
    hooks.emit({ type: 'dev:start', config: resolvedConfig })


    const { root, target, services, electron } = resolvedConfig

    const outDir = join(root, globalTempDir) // Temporary directory for the build
    const filesystemManager = await handleTemporaryDirectories(outDir)
    const scopedConfig = { ...resolvedConfig, outDir }

    let closed

    const startManager = {
      close: function () {
        filesystemManager.close()
        if (closed) return
        closed = true
        const { frontend, services } = this
        frontend?.close()
        services?.close()
      },
    } as {
      url?: string
      frontend?: Awaited<ReturnType<typeof createServer>>
      services?: Awaited<ReturnType<typeof createAllServices>>
      close: () => void
    }

    onCleanup(() => startManager.close())

    // ------------------------------- Mobile -------------------------------
    if (isMobile(target)) {
      await initializeWebsocketPort()
      await build(scopedConfig, { services, dev: true }) // Build the frontend and assets for mobile
      startManager.services = await runDevelopmentPlugins(scopedConfig, hooks)
      return startManager
    }

    // ------------------------------- Desktop -------------------------------
    if (isDesktop(target)) {
      const electronDevOptions = electron?.dev || {}
      const { load = 'url' } = electronDevOptions // Default to loading from URL

      // Load Files in Dev Mode
      if (load === 'file') {
        const outDir = await build(scopedConfig, { services, dev: true })
        configureForDesktop(outDir, root)
        await startElectronInstance(root, hooks) // Start the Electron instance

        hooks.emit({
          type: 'dev:reload:unavailable',
          target,
          reason: `Electron is running in ${load} mode`
        })
        // app.stdin.write(`${JSON.stringify({ command: 'reload', data: { frontend: true, service: true } })}\n`) // Send a reload command to the Electron app
      }

      // Use Vite to Load URLs in Dev Mode
      else {
        const assets = await getAppAssets(scopedConfig, true)
        await buildAssets(assets, { outDir, root, target })
        .catch(err => {
          console.log('Error building assets:', err)
          throw err
        })
        if (isDesktop(target)) await buildServices(scopedConfig, { dev: true, outDir, rebuild: true, hooks })
        configureForDesktop(outDir, root)
        const frontend = (startManager.frontend = await createServer(scopedConfig))
        startManager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
      }

      // reset() // Reset the package.json to the original state

      return startManager
    }

    // ------------------------------- Web -------------------------------
    await initializeWebsocketPort()
    const webAssets = await getAppAssets(scopedConfig, true)
    await buildAssets(webAssets, { outDir, root, target })
    .catch(err => {
      console.log('Error building assets:', err)
      throw err
    })

    const frontend = (startManager.frontend = await createServer(scopedConfig))
    startManager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server

    startManager.services = await runDevelopmentPlugins(scopedConfig, hooks) // Run the development plugins

    // Emit dev server ready event
    const { port, host } = frontend.config.server
    const protocol = frontend.config.server.https ? 'https' : 'http'
    const url = `${protocol}://${host || 'localhost'}:${port}`
    hooks.emit({ type: 'dev:server:ready', target, url  })
    return startManager

  } catch (error) {
    hooks.emit({
      type: 'dev:server:error',
      error: error as Error
    })
  }
}

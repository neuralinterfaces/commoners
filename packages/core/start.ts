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
import { getPlugins, getServices } from './utils/extensions.js'
import { globalTempDir, handleTemporaryDirectories, isDesktop, isMobile, vite } from './globals.js'
import { onCleanup } from './cleanup.js'
import { createLogger } from './assets/utils/logger.js'

import { Plugin, ResolvedConfig, UserConfig, HooksInterface } from './types.js'
import { createNoOpHooks } from './ui.js'
import { createServer } from './vite/index.js'

// Internal Utilities
import { runAppPlugins } from './assets/plugins/index.js'
import { getFreePorts } from './assets/services/network.js'

import { startElectronInstance } from './vite/plugins/electron/index.js'
import { buildAssets, getAppAssets } from './utils/assets.js'

const logger = createLogger('start')

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
  const { target } = config
  const services = getServices(config.extensions)
  const { env } = process

  // Copy plugins to allow for modification when assigned as modules
  const plugins = Object.entries(getPlugins(config.extensions)).reduce((acc, [name, plugin]) => {
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
        logger.debug('Emitting dev:server:error', { context })
        hooks.emit({
          type: 'dev:server:error',
          error: new Error(`Unknown WS message context: ${context}`),
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

export const services = async (
  config: UserConfig,
  resolvedServices,
  hooks: HooksInterface = createNoOpHooks()
) => {
  const dev = true
  const resolvedConfig = await resolveConfig(config)
  const { root, target } = resolvedConfig
  const allServices = getServices(resolvedConfig.extensions)
  await buildServices(resolvedConfig, { services: resolvedServices, dev, hooks }) // Build service outputs
  resolvedServices = resolvedServices || allServices // Use all services if none are provided
  return await createAllServices(resolvedServices, { root, target, hooks }) // Create services
}

const startServices = services

export const app = async function (config: UserConfig, options: { hooks?: HooksInterface } = {}) {
  const resolvedConfig = await resolveConfig(config, { hooks: options.hooks })
  const hooks = resolvedConfig.hooks

  try {
    // Emit dev server start event
    logger.debug('Emitting dev:start', { target: resolvedConfig.target })
    hooks.emit({ type: 'dev:start', config: resolvedConfig })

    const { root, target, electron } = resolvedConfig
    const services = getServices(resolvedConfig.extensions)

    const outDir = join(root, globalTempDir) // Temporary directory for the build
    const scopedConfig = { ...resolvedConfig, outDir } as ResolvedConfig
    // Preserve __resolved flag (non-enumerable, not copied by spread) so downstream
    // functions that call resolveConfig() don't re-resolve with incompatible extensions format
    Object.defineProperty(scopedConfig, '__resolved', { value: true })
    const filesystemManager = await handleTemporaryDirectories(scopedConfig)

    let closed

    const startManager = {
      close: async function () {
        filesystemManager.close()
        if (closed) return
        closed = true
        const { frontend, services } = this
        await frontend?.close()
        await services?.close()
      },
    } as {
      url?: string
      frontend?: Awaited<ReturnType<typeof createServer>> | { close: () => void | Promise<void> }
      services?: Awaited<ReturnType<typeof createAllServices>>
      close: () => void | Promise<void>
    }

    onCleanup(() => startManager.close())

    // ------------------------------- Mobile -------------------------------
    if (isMobile(target)) {
      await initializeWebsocketPort()

      const buildMetadata = await build(scopedConfig, { services, dev: true }) // Build the frontend and assets for mobile
      startManager.services = await runDevelopmentPlugins(scopedConfig, hooks)

      // In testing mode, serve the web assets for Playwright instead of opening IDE
      if (process.env.__COMMONERS_TESTING) {
        const __vite = await vite
        const server = await __vite.preview({
          build: { outDir: buildMetadata.web },
          preview: { open: false },
        })
        const port = server.config.preview.port
        startManager.url = `http://localhost:${port}`
        startManager.frontend = server
        return startManager
      }

      // Interactive mode: Initialize and open the native IDE (Xcode for iOS, Android Studio for Android)
      const mobile = await import('./mobile/index.js')
      const mobileOpts = { target: target as 'ios' | 'android', outDir: buildMetadata.web }
      const isHeadless = process.env.CI === 'true' || process.env.COMMONERS_HEADLESS === 'true'

      await mobile.runInRoot(async config => {
        await mobile.init(mobileOpts, config)
        await mobile.open(mobileOpts, config, { headless: isHeadless })
      }, scopedConfig)

      return startManager
    }

    // ------------------------------- Desktop -------------------------------
    if (isDesktop(target)) {
      const electronDevOptions = electron?.dev || {}
      const { load = 'url' } = electronDevOptions // Default to loading from URL

      // Load Files in Dev Mode
      if (load === 'file') {
        const { artifact: builtOutDir } = await build(scopedConfig, { services, dev: true })
        configureForDesktop(builtOutDir, root)
        await startElectronInstance(root, hooks, builtOutDir) // Start the Electron instance

        logger.debug('Emitting dev:reload:unavailable', { target, loadMode: load })
        hooks.emit({
          type: 'dev:reload:unavailable',
          target,
          reason: `Electron is running in ${load} mode`,
        })
        // app.stdin.write(`${JSON.stringify({ command: 'reload', data: { frontend: true, service: true } })}\n`) // Send a reload command to the Electron app
      }

      // Use Vite to Load URLs in Dev Mode
      else {
        const assets = await getAppAssets(scopedConfig, true, outDir)
        await buildAssets(assets, { outDir, root, target, dev: true }).catch(err => {
          console.log('Error building assets:', err)
          throw err
        })
        if (isDesktop(target)) {
          await buildServices(scopedConfig, { dev: true, rebuild: true, hooks }) // Attempt to rebuild all
        }
        configureForDesktop(outDir, root)
        const frontend = (startManager.frontend = await createServer(scopedConfig))
        startManager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
      }

      // reset() // Reset the package.json to the original state

      return startManager
    }

    // ------------------------------- Web -------------------------------
    await initializeWebsocketPort()
    const webAssets = await getAppAssets(scopedConfig, true, outDir)
    await buildAssets(webAssets, { outDir, root, target, dev: true }).catch(err => {
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
    logger.debug('Emitting dev:server:ready', { target, url })
    hooks.emit({ type: 'dev:server:ready', target, url })

    return startManager
  } catch (error) {
    logger.debug('Emitting dev:server:error', { error: (error as Error).message })
    hooks.emit({
      type: 'dev:server:error',
      error: error as Error,
    })
    throw error
  }
}

/**
 * Plugins Module
 *
 * Handles plugin loading and lifecycle management for Electron.
 * This module is responsible for:
 * - Plugin context creation
 * - Plugin lifecycle hooks (load, unload)
 * - Plugin asset management
 * - Plugin IPC integration
 */

import { BrowserWindow } from 'electron'
import { join, basename, extname } from 'node:path'
import { runAppPlugins } from '../../plugins'
import { resolveLazy } from '../../utils'
import { ListenerHandle } from './ipc'
import type { DesktopRuntime } from '../../runtime/types'
import type { HooksInterface } from '../../../types'

/**
 * Plugin context for each plugin
 */
export interface PluginContext {
  id: string
  MOBILE: boolean
  DESKTOP: boolean
  WEB: boolean
  electron: any
  utils: any
  runtime: DesktopRuntime
  createWindow: (page: string, opts: any) => Promise<BrowserWindow>
  open: () => Promise<BrowserWindow | null | undefined>
  send: (channel: string, ...args: any[]) => void
  handle: (channel: string, callback: (...args: any[]) => any, win?: BrowserWindow) => ListenerHandle
  on: (channel: string, callback: (...args: any[]) => void, win?: BrowserWindow) => ListenerHandle
  setAttribute: (win: BrowserWindow, attr: string, value: any) => void
  getAttribute: (win: BrowserWindow, attr: string) => any
  hooks: HooksInterface
  plugin: {
    assets: Record<string, string>
  }
}

/**
 * Initialize plugin contexts
 * Returns both the copied plugins (which are mutable) and the contexts
 */
export function initializePlugins(
  plugins: Record<string, any>,
  viteAssetsPath: string,
  isProduction: boolean,
  electron: any,
  utils: any,
  createWindowFn: (page: string, opts: any) => Promise<BrowserWindow>,
  restoreWindowFn: () => BrowserWindow | null,
  runtime: DesktopRuntime,
  hooks?: HooksInterface
): { plugins: Record<string, any>; contexts: Map<string, PluginContext> } {
  const contexts = new Map<string, PluginContext>()

  // Copy the plugins in case they aren't extensible
  const PLUGINS = Object.entries(plugins).reduce((acc, [key, value]) => {
    acc[key] = { ...value }
    return acc
  }, {} as Record<string, any>)

  // Create contexts for each plugin
  for (const [id, plugin] of Object.entries(PLUGINS)) {
    const { assets = {} } = plugin

    const context: PluginContext = {
      id,

      MOBILE: false,
      DESKTOP: true,
      WEB: false,

      // Packaged Electron Utilities
      electron,
      utils,

      // Runtime abstraction
      runtime,

      // Helper Functions
      createWindow: (page: string, opts: any) => createWindowFn(page, opts),
      open: async () => {
        await runtime.lifecycle.onReady(() => {})
        const { firstInitialized } = require('./window').getWindowContext()
        if (firstInitialized) {
          return restoreWindowFn() || (await createWindowFn(undefined, {}))
        }
        return null
      },
      send: function (channel, ...args) {
        return runtime.scopedIPC.pluginSend(this.id, channel, ...args)
      },
      handle: function (channel, callback, win?: BrowserWindow) {
        const listener = runtime.scopedIPC.pluginHandle(this.id, channel, callback)
        if (win) (win as any).__listeners.push(listener)
        return listener
      },
      on: function (channel, callback, win?: BrowserWindow) {
        const listener = runtime.scopedIPC.pluginOn(this.id, channel, callback)
        if (win) (win as any).__listeners.push(listener)
        return listener
      },

      setAttribute: function (win, attr, value) {
        const scopedAttr = `window:${this.id}:${attr}`
        ;(win as any)[scopedAttr] = value
      },
      getAttribute: function (win, attr) {
        const scopedAttr = `window:${this.id}:${attr}`
        return (win as any)[scopedAttr]
      },

      // Hooks interface for framework event bus
      hooks: hooks || { emit: () => {}, on: () => () => {} },

      // Provide specific variables from the plugin
      plugin: {
        assets: Object.entries(assets).reduce((acc, [key, src]) => {
          const filename = basename(src as string)
          const isHTML = extname(filename) === '.html'
          if (!isProduction || isHTML) acc[key] = src
          else acc[key] = join(viteAssetsPath, 'plugins', id, key, filename)
          return acc
        }, {} as Record<string, string>),
      },
    }

    contexts.set(id, context)
  }

  return { plugins: PLUGINS, contexts }
}

/**
 * Create bound runAppPlugins function
 */
export function createBoundRunAppPlugins(
  plugins: Record<string, any>,
  contexts: Map<string, PluginContext>,
  isProduction: boolean
) {
  return runAppPlugins.bind({
    env: {
      WEB: false,
      DESKTOP: true,
      MOBILE: false,
      TARGET: 'electron',
      DEV: !isProduction,
      PROD: isProduction,
    },
    plugins,
    contexts: Array.from(contexts.entries()).reduce((acc, [id, ctx]) => {
      acc[id] = ctx
      return acc
    }, {} as Record<string, PluginContext>),
  })
}

/**
 * Run a plugin hook for a specific plugin
 */
export async function runPluginHook(
  win: BrowserWindow | null,
  pluginId: string,
  hookType: 'load' | 'unload',
  plugins: Record<string, any>,
  contexts: Map<string, PluginContext>,
  createWindowFn?: (page: string, opts: any, toIgnore?: string[]) => Promise<BrowserWindow>
): Promise<any> {
  const plugin = plugins[pluginId]
  if (!plugin) return

  // Resolve lazy desktop object, then cache
  let desktopState = await resolveLazy(plugin.desktop)
  desktopState = desktopState ?? {}
  plugin.desktop = desktopState

  const hook = desktopState[hookType]

  if (!hook) return

  const context = contexts.get(pluginId)
  if (!context) return

  // Prevent recursive window creation in load function
  if (hookType === 'load' && createWindowFn) {
    const originalCreateWindow = context.createWindow
    context.createWindow = (page, opts) => createWindowFn(page, opts, [pluginId])

    try {
      const result = await hook.call(context, win, pluginId)
      return result
    } finally {
      context.createWindow = originalCreateWindow
    }
  } else {
    return await hook.call(context, win, pluginId)
  }
}

/**
 * Run plugin hooks for all plugins
 */
export async function runPluginHooks(
  win: BrowserWindow | null,
  hookType: 'load' | 'unload',
  plugins: Record<string, any>,
  contexts: Map<string, PluginContext>,
  toIgnore: string[] = [],
  createWindowFn?: (page: string, opts: any, toIgnore?: string[]) => Promise<BrowserWindow>
): Promise<any[]> {
  return await Promise.all(
    Object.keys(plugins).map(async id => {
      if (toIgnore.includes(id)) return
      return runPluginHook(win, id, hookType, plugins, contexts, createWindowFn)
    })
  )
}

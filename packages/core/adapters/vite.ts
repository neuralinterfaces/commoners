/**
 * Vite Build Adapter
 *
 * Default BuildAdapter implementation that wraps Vite.
 * This is the current behavior extracted into the adapter interface.
 */

import { isAbsolute, resolve, relative } from 'node:path'
import type { BuildAdapter, AdapterConfig, AdapterBuildResult, AdapterDevServer } from './types.js'
import { resolveViteConfig } from '../vite/index.js'
import { ScopedLogger } from '../vite/logger.js'
import { vite } from '../globals.js'

/**
 * Create the default Vite build adapter
 */
export function createViteAdapter(): BuildAdapter {
  return {
    name: 'vite',

    async build(config: AdapterConfig): Promise<AdapterBuildResult> {
      const { root, outDir, config: resolvedConfig, dev, hooks } = config
      const absoluteRoot = isAbsolute(root) ? root : resolve(root)

      const viteConfig = {
        ...resolvedConfig,
        root: absoluteRoot,
        outDir: relative(absoluteRoot, outDir),
      }

      const resolvedViteConfig = await resolveViteConfig(viteConfig, { dev, hooks })

      const _vite = await vite
      const customViteLogger = new ScopedLogger((...args: unknown[]) =>
        customViteLogger.call(() => hooks.emit({ type: 'log', args }))
      )
      await _vite.build({ ...resolvedViteConfig, customLogger: customViteLogger })
      customViteLogger.close()

      return { outDir, assets: [] }
    },

    async createDevServer(config: AdapterConfig): Promise<AdapterDevServer> {
      const { root, config: resolvedConfig, dev, hooks } = config
      const absoluteRoot = isAbsolute(root) ? root : resolve(root)

      const viteConfig = {
        ...resolvedConfig,
        root: absoluteRoot,
      }

      const resolvedViteConfig = await resolveViteConfig(viteConfig, { dev, hooks })

      const _vite = await vite
      const server = await _vite.createServer(resolvedViteConfig)
      await server.listen()

      const address = server.httpServer?.address()
      const url = typeof address === 'string' ? address : `http://localhost:${address?.port ?? 5173}`

      return {
        url,
        close: async () => {
          await server.close()
        },
      }
    },

    async serve(options: { outDir: string; open?: boolean }): Promise<AdapterDevServer> {
      const _vite = await vite
      const srv = await _vite.preview({
        build: { outDir: options.outDir },
      })
      const port = srv.config.preview.port
      return {
        url: `http://localhost:${port}`,
        close: async () => { srv.httpServer?.close() },
      }
    },

    loadEnv(mode: string, root: string, prefix = ''): Record<string, string> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { loadEnv } = require('vite')
        return loadEnv(mode, root, prefix)
      } catch {
        return {}
      }
    },

    mergeConfig(
      base: Record<string, unknown>,
      override: Record<string, unknown>
    ): Record<string, unknown> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { mergeConfig } = require('vite')
        return mergeConfig(base, override)
      } catch {
        return { ...base, ...override }
      }
    },
  }
}

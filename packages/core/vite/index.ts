// Built-In Modules
import { extname, isAbsolute, join, relative } from 'node:path'

// General Internal Imports
import { isDesktop, isTauri, vite, chalk } from '../globals.js'
import { ResolvedConfig, ServerOptions, ViteOptions } from '../types.js'
import { getPlugins } from '../utils/extensions.js'
import { ScopedLogger } from './logger.js'

// Internal Plugins
import electronPlugin from './plugins/electron/index.js'
import commonersPlugin from './plugins/commoners.js'

// Internal Imports
import { getAssetBuildPath } from '../utils/assets.js'

import { getAllIcons, getIcon } from '../assets/utils/icons.js'
import { safePath } from '../assets/utils/paths.js'
import { existsSync } from 'node:fs'

type ManifestOptions = import('vite-plugin-pwa').ManifestOptions
type VitePWAOptions = import('vite-plugin-pwa').VitePWAOptions

type Plugin = import('vite').Plugin
type ViteServerOptions = import('vite').ServerOptions

const getAbsolutePath = (root: string, path: string) => (isAbsolute(path) ? path : join(root, path))

// Run a development server
export const createServer = async (config: ResolvedConfig) => {
  const _vite = await vite
  const { hooks } = config

  // Create the frontend server
  const server = await _vite.createServer(await resolveViteConfig(config, { hooks }, false))
  await server.listen()
  return server
}

type PWAOptions = {
  icon: ResolvedConfig['icon']
  name: ResolvedConfig['name']
  appId: ResolvedConfig['appId']
  description: ResolvedConfig['description']
  root: ResolvedConfig['root']
}

const resolvePWAOptions = (
  opts = {},
  { name, description, appId, icon, root }: PWAOptions,
  outDir: string
) => {
  const pwaOpts = { ...opts } as Partial<VitePWAOptions>

  if (!('includeAssets' in pwaOpts)) pwaOpts.includeAssets = []
  else if (!Array.isArray(pwaOpts.includeAssets)) pwaOpts.includeAssets = [pwaOpts.includeAssets]

  // Only include preferred icons
  const icons = getAllIcons(icon).map((src: string) => relative(outDir, getAssetBuildPath(getAbsolutePath(root, src), outDir)))
  const scopedIconPaths = icons.map(src => safePath(src))
  pwaOpts.includeAssets.push(...scopedIconPaths) // Include specified assets

  const baseManifest = {
    id: `?${appId}=1`,

    start_url: '.',

    theme_color: '#ffffff', // copy.design?.theme_color ??
    background_color: '#fff',
    display: 'standalone',

    // Dynamic
    name,
    short_name: name,
    description,

    // Generated
    icons: icons.map(src => {
      return { src: safePath(src), type: `image/${extname(src).slice(1)}`, sizes: 'any' }
    }),
  } as Partial<ManifestOptions>

  pwaOpts.manifest = 'manifest' in pwaOpts ? { ...baseManifest, ...pwaOpts.manifest } : baseManifest // Naive merge

  // Configure workbox for proper caching behavior
  if (!('workbox' in pwaOpts)) {
    pwaOpts.workbox = {
      globPatterns: ['**/*.{html,js,css,svg,png,webp,ico,woff2}'], // Cache common web assets
      additionalManifestEntries: [ ...scopedIconPaths.map(src => ({ url: src, revision: null }))], // Ensures that icons are cached
      cleanupOutdatedCaches: true, // Ensure outdated caches are cleaned up
      clientsClaim: true, // Force service worker to activate immediately
      skipWaiting: true,
    }
  }

  return pwaOpts as ResolvedConfig['pwa']
}

export const resolveViteConfig = async (
  commonersConfig: ResolvedConfig,
  { dev = true, hooks }: ViteOptions,
  build = true
) => {
  const _vite = await vite
  let { vite: viteUserConfig = {}, target, outDir, port, public: isPublic } = commonersConfig

  const isDesktopTarget = isDesktop(target)

  if (typeof viteUserConfig === 'string')
    viteUserConfig = (
      await _vite.loadConfigFromFile(
        { command: build ? 'build' : 'serve', mode: build ? 'production' : 'development' },
        viteUserConfig
      )
    ).config

  const plugins: Plugin[] = []

  const {
    name,
    appId,
    root,
    icon,
    description,
    pages = {},
    electron,
  } = commonersConfig

  const commonersPlugins = getPlugins(commonersConfig.extensions)

  // Ensure root is absolute for all operations
  const absoluteRoot = isAbsolute(root) ? root : resolve(root)

  // Desktop Build
  if (isTauri(target)) {
    const tauriPlugin = (await import('./plugins/tauri/index.js')).default
    const plugin = await tauriPlugin({ root: absoluteRoot, outDir, hooks, config: commonersConfig })
    plugins.push(...plugin)
  } else if (isDesktopTarget) {
    const plugin = await electronPlugin({ build, root: absoluteRoot, outDir, electron, hooks })
    plugins.push(...plugin)
  }

  // PWA Build
  else if (target === 'pwa') {
    const opts = resolvePWAOptions(
      commonersConfig.pwa,
      {
        name,
        appId,
        icon,
        description,
        root: absoluteRoot,
      },
      outDir
    )

    const VitePWAPlugin = await import('vite-plugin-pwa').then(m => m.VitePWA)

    const pwaPlugins = VitePWAPlugin({ registerType: 'autoUpdate', ...opts })
    plugins.push(...(Array.isArray(pwaPlugins) ? pwaPlugins : [pwaPlugins]))
  }

  // Get html files from plugins
  const pluginPages = Object.values(commonersPlugins).reduce((acc, plugin) => {
    Object.values(plugin.assets ?? {}).forEach(assetSrc => {
      if (extname(assetSrc) === '.html') acc[crypto.randomUUID()] = getAbsolutePath(absoluteRoot, assetSrc)
    })
    return acc
  }, {}) as Record<string, string>

  const collectedPages = { ...pages, ...pluginPages }

  const rollupOptions = {}

  // Always resolve pages with the root HTML file
  const rootHTML = getAbsolutePath(absoluteRoot, 'index.html')
  const rootHTMLExists = existsSync(rootHTML)
  const allPages = Object.values(collectedPages)
  if (rootHTMLExists && !allPages.includes(rootHTML)) allPages.push(rootHTML)
  const allUniquePages = Array.from(new Set(allPages))
  rollupOptions.input = allUniquePages.reduce((acc, filepath) => {
    acc[crypto.randomUUID()] = filepath
    return acc
  }, {})
  
  const nPages = allPages.length
  const hasAnyPages = nPages > 0

  const serverConfig = {
    port,
    open: hasAnyPages && !isDesktopTarget && !process.env.VITEST, // Open the browser unless testing / building for desktop
  } as ViteServerOptions

  if (isPublic) serverConfig.host = '0.0.0.0'

  // Define a default set of plugins and configuration options
  const viteConfig = _vite.defineConfig({
    logLevel: dev ? 'silent' : 'info',
    base: './',
    root: absoluteRoot, // Resolve index.html from the root directory (must be absolute)
    build: {
      emptyOutDir: false,
      outDir,
      rollupOptions,
    },
    plugins,
    server: serverConfig, // Open the browser unless testing / building for desktop
    clearScreen: false,
    envPrefix: ['VITE_', 'COMMONERS_'], // Allow for Commoners-specific environment variables
  })

  const mergedConfig = _vite.mergeConfig(viteConfig, viteUserConfig)
  const mode = dev ? 'development' : 'production'
  const env = _vite.loadEnv(mode, absoluteRoot, mergedConfig.envPrefix)

  mergedConfig.plugins = [
    ...mergedConfig.plugins,
    commonersPlugin({
      config: {
        ...commonersConfig,
        vite: mergedConfig,
      },
      build,
      dev,
      env,
    }),
  ]

  return mergedConfig
}

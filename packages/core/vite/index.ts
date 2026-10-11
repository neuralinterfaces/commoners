// Built-In Modules
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

// General Internal Imports
import { isDesktop, isTauri, vite } from '../globals.js'
import { ResolvedConfig, ViteOptions } from '../types.js'
import { getPlugins } from '../utils/extensions.js'

// Internal Plugins
import electronPlugin from './plugins/electron/index.js'
import commonersPlugin from './plugins/commoners.js'

// Internal Imports
import { getAssetBuildPath } from '../utils/assets.js'

import { getAllIcons } from '../assets/utils/icons.js'
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
  const icons = getAllIcons(icon).map((src: string) =>
    relative(outDir, getAssetBuildPath(getAbsolutePath(root, src), outDir))
  )
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
      additionalManifestEntries: [...scopedIconPaths.map(src => ({ url: src, revision: null }))], // Ensures that icons are cached
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
  const { target, outDir, port, public: isPublic } = commonersConfig
  let { vite: viteUserConfig = {} } = commonersConfig

  const isDesktopTarget = isDesktop(target)

  if (typeof viteUserConfig === 'string')
    viteUserConfig = (
      await _vite.loadConfigFromFile(
        { command: build ? 'build' : 'serve', mode: build ? 'production' : 'development' },
        viteUserConfig
      )
    ).config

  const plugins: Plugin[] = []

  const { name, appId, root, icon, description, pages = {}, electron } = commonersConfig

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

    const { importOptional } = await import('../utils/optional.js')
    const VitePWAPlugin = await importOptional<typeof import('vite-plugin-pwa')>(
      'vite-plugin-pwa',
      'PWA builds'
    ).then(m => m.VitePWA)

    const pwaPlugins = VitePWAPlugin({ registerType: 'autoUpdate', ...opts })
    plugins.push(...(Array.isArray(pwaPlugins) ? pwaPlugins : [pwaPlugins]))
  }

  // Web/PWA builds: meta CSP with inline-script hashes + a _headers file. Packaged Electron
  // apps load file:// pages, where the dev-time header CSP never applies, so they embed the
  // same policy in each page. Tauri applies it through tauri.conf.json.
  const security = (commonersConfig as any).security ?? {}
  if (build && (target === 'web' || target === 'pwa')) {
    const webSecurityPlugin = (await import('./plugins/web-security.js')).default
    plugins.push(webSecurityPlugin(security, { pwa: target === 'pwa' }))
  } else if (build && isDesktopTarget && !isTauri(target)) {
    const webSecurityPlugin = (await import('./plugins/web-security.js')).default
    const csp = (electron as any)?.security?.csp ?? security.csp
    plugins.push(webSecurityPlugin({ ...security, csp }, { target: 'electron' }))
  }

  // Every target: report code the shared CSP will block at runtime (eval, Function, string timers)
  if (build) {
    const noEvalPlugin = (await import('./plugins/no-eval.js')).default
    const plugin = noEvalPlugin((commonersConfig as any).security?.noEval ?? 'warn', absoluteRoot)
    if (plugin) plugins.push(plugin)

    // Every target: record which packages the bundle includes, for the build record's SBOM
    const { bundleInventoryPlugin } = await import('../utils/build-record.js')
    plugins.push(bundleInventoryPlugin(absoluteRoot))
  }

  // Get html files from plugins
  const pluginPages = Object.entries(commonersPlugins).reduce((acc, [id, plugin]) => {
    Object.entries(plugin.assets ?? {}).forEach(([key, assetSrc]) => {
      if (extname(assetSrc) === '.html')
        acc[`plugin:${id}:${key}`] = getAbsolutePath(absoluteRoot, assetSrc)
    })
    return acc
  }, {}) as Record<string, string>

  const collectedPages = { ...pages, ...pluginPages }

  const rollupOptions: { input?: Record<string, string> } = {}

  // Always resolve pages with the root HTML file
  const rootHTML = getAbsolutePath(absoluteRoot, 'index.html')
  const rootHTMLExists = existsSync(rootHTML)
  const allPages = Object.values(collectedPages)
  if (rootHTMLExists && !allPages.includes(rootHTML)) allPages.push(rootHTML)
  const allUniquePages = Array.from(new Set(allPages))
  // Entry names come from each page's path, so the same project builds to the same file names
  rollupOptions.input = allUniquePages.reduce(
    (acc, filepath) => {
      const base =
        relative(absoluteRoot, filepath)
          .replace(/\.html?$/, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'page'
      let name = base
      for (let n = 2; name in acc; n++) name = `${base}-${n}`
      acc[name] = filepath
      return acc
    },
    {} as Record<string, string>
  )

  const nPages = allPages.length
  const hasAnyPages = nPages > 0

  const serverConfig = {
    port,
    open: hasAnyPages && !isDesktopTarget && !process.env.VITEST, // Open the browser unless testing / building for desktop
  } as ViteServerOptions

  if (isPublic) serverConfig.host = '0.0.0.0'

  // Same isolation headers in dev as in the built output, so dev matches hosting
  if ((commonersConfig as any).security?.crossOriginIsolation) {
    const { CROSS_ORIGIN_ISOLATION_HEADERS } = await import('./plugins/web-security.js')
    serverConfig.headers = { ...serverConfig.headers, ...CROSS_ORIGIN_ISOLATION_HEADERS }
  }

  // Define a default set of plugins and configuration options
  // Features: the same compile-time defines as the config bundles, so disabled code is
  // removed from the app bundle by dead-code elimination
  const { resolveFeatures, featureDefines } = await import('../utils/features.js')
  const features = resolveFeatures((commonersConfig as any).features, {
    target,
    mode: dev ? 'development' : 'production',
  })

  const viteConfig = _vite.defineConfig({
    define: featureDefines(features),
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

// Built-In Modules
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { existsSync, mkdirSync, unlink, writeFileSync } from 'node:fs'

// Internal Imports
import { templateDir, ensureTargetConsistent, globalTempDir } from './globals.js'
import { onCleanup } from './cleanup.js'

import {
  ConfigResolveOptions,
  Extension,
  Plugin,
  ResolvedConfig,
  ResolvedExtensions,
  ResolvedServices,
  ServiceCreationOptions,
  UserConfig,
  UserService,
} from './types.js'
import { resolveAll, createAll } from './assets/services/index.js'
import { resolveFile, getJSON } from './utils/files.js'
import merge from './utils/merge.js'
import { lstatSync } from './utils/lstat.js'
import { pathToFileURL } from 'node:url'

// Error classes
import { ConfigurationError, ValidationError } from './errors.js'

// Security utilities
import { validatePath } from './utils/security.js'

// Logging
import { createLogger } from './assets/utils/logger.js'
const logger = createLogger('config')

import { resolveHooks } from './assets/utils/hooks.js'
export { resolveHooks }

// Export error classes for consumers
export {
  CommonersError,
  ConfigurationError,
  ValidationError,
  DependencyError,
  PlatformError,
  BuildError,
} from './errors.js'

const getAbsolutePath = (root: string, path: string) => (isAbsolute(path) ? path : join(root, path))

// Top-Level Package Exports
export * from './types.js'
export * from './globals.js'
export * from './assets/services/index.js' // Service Helpers

export * as format from './utils/formatting.js'
export {
  getBuildAdapter,
  setBuildAdapter,
  registerServiceBundler,
  getServiceBundler,
} from './adapters/index.js'
export type { BuildAdapter, ServiceBundler, AdapterConfig } from './adapters/types.js'
export { launchApp as launch, launchServices, resolveAppToLaunch } from './launch.js'
export { buildApp as build, buildServices } from './build.js'
export { shareServices } from './share.js'
export { app as start, services as startServices } from './start.js'
export { packageFile } from './utils/assets.js'
export { merge } // Other Helpers
export { lazy } from './assets/utils/index.js' // Lazy factory helper for tree-shaking
export {
  Logger,
  LogLevel,
  createLogger,
  getLogger,
  configureLogger,
  setGlobalLogLevel,
  setGlobalUI,
  getGlobalUI,
} from './assets/utils/logger.js' // Logging

// ------------------ Configuration File Handling ------------------
export const resolveConfigPath = (base = '') =>
  resolveFile(join(base, 'commoners.config'), ['.ts', '.js'])

const isDirectory = (root: string) => lstatSync(root).isDirectory()

const isCommonersProject = async (root: string = process.cwd()) => {
  const rootExists = existsSync(root)

  let failError: ConfigurationError | undefined

  // Root does not exist
  if (root && !rootExists)
    failError = new ConfigurationError('Invalid Commoners project', `This path does not exist.`)

  if (failError) {
    logger.error(failError.message, { root, reason: failError.details })
    throw failError
  }
}

export async function loadConfigFromFile(root: string = resolveConfigPath()) {
  const rootExists = existsSync(root)

  if (existsSync(root)) {
    root = resolve(root) // Resolve to absolute path
    if (!isDirectory(root)) root = dirname(root) // Get the parent directory
  }

  await isCommonersProject(root)

  const configPath = resolveConfigPath(
    rootExists
      ? root // New root config
      : '' // Base config
  )

  const resolvedRoot = configPath ? dirname(configPath) : root || process.cwd()

  let config = {} as UserConfig // No user-defined configuration found

  if (configPath) {
    const configOutputPath = join(resolvedRoot, globalTempDir, `commoners.config.mjs`)

    // Use esbuild directly — faster than Vite's Rollup pipeline, produces a single
    // file (no code-split chunks), and doesn't need browser polyfills.
    const esbuild = await import('esbuild')
    mkdirSync(dirname(configOutputPath), { recursive: true })
    await esbuild.build({
      entryPoints: [configPath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: configOutputPath,
      logLevel: 'silent',
      // Externalize packages that cannot be bundled into a config snapshot:
      // - electron: only available inside the Electron runtime
      // - *.node: native addons (e.g. keytar) require a loader at runtime
      // - @aws-sdk/*: optional peer of unzipper, not always installed
      external: ['electron', '*.node', '@aws-sdk/*'],
      // Rewrite import.meta.url to the *source* config file so getDirname() etc.
      // resolve paths relative to the project root, not the temp output directory.
      define: { 'import.meta.url': JSON.stringify(pathToFileURL(configPath).href) },
      // esbuild wraps CJS deps in __commonJS which uses __require (a require polyfill).
      // In .mjs files, require() is unavailable. Inject createRequire so __require works.
      // Use the output file URL (not import.meta.url, which is overridden by define above).
      banner: {
        js: `import { createRequire as __bundled_createRequire } from 'node:module';const require = __bundled_createRequire(${JSON.stringify(pathToFileURL(configOutputPath).href)});`,
      },
    })

    const fileURL = pathToFileURL(configOutputPath).href

    try {
      config = (await import(fileURL)).default as UserConfig
    } finally {
      onCleanup(() => unlink(configOutputPath, () => {}))
    }
  }

  // Set the root of the project (always absolute for consistent path resolution)
  config.root = resolvedRoot

  return config
}

// ------------------- Extension Classification -------------------
const pluginKeys = ['load', 'desktop', 'isSupported', 'start', 'ready', 'quit', 'assets']
const serviceKeys = ['src', 'url', 'port', 'build', 'publish', 'ssl', 'env']

function isPluginLike(ext: Extension): ext is Plugin {
  if (typeof ext !== 'object' || ext === null) return false
  return pluginKeys.some(key => key in ext)
}

function isServiceLike(ext: Extension): ext is UserService {
  if (typeof ext === 'string') return true
  if (typeof ext !== 'object' || ext === null) return false
  return serviceKeys.some(key => key in ext)
}

function classifyExtensions(extensions: Record<string, Extension>): {
  plugins: Record<string, Plugin>
  services: Record<string, UserService>
} {
  const plugins: Record<string, Plugin> = {}
  const services: Record<string, UserService> = {}

  for (const [id, ext] of Object.entries(extensions)) {
    const plugin = isPluginLike(ext)
    const service = isServiceLike(ext)

    if (plugin) plugins[id] = ext as Plugin
    if (service) services[id] = ext as UserService
    if (!plugin && !service) {
      // Default: treat as plugin if it's an object with no recognized keys
      plugins[id] = ext as Plugin
    }
  }

  return { plugins, services }
}

// ------------------- Extension Helpers -------------------
export { getPlugins, getServices } from './utils/extensions.js'

export async function resolveConfig(
  o: UserConfig = {},
  {
    // Service Auto-Configuration
    build = false,
    dev: _dev = !build,

    // Advanced Service Configuration
    services,

    hooks: hooksOverride,
  }: ConfigResolveOptions = {}
) {
  const isResolved = (o as Record<string, any>).__resolved

  if (isResolved) return o as ResolvedConfig

  // Always use absolute root path for consistent path resolution
  const root = o.root ? (isAbsolute(o.root) ? o.root : resolve(o.root)) : process.cwd()
  o.root = root

  const { services: ogServices, plugins, extensions, vite, ...temp } = o

  const userPkg = getJSON(join(root, 'package.json'))

  // Merge Config and package.json (transformed name)
  const {
    hooks, // Do not copy
    electron = {},
    ...rest
  } = temp

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hooks: _electronHooks, ...electronRest } = electron

  o = merge(structuredClone({ ...rest, electron: electronRest }), {
    ...userPkg,
    name: userPkg.name
      ? userPkg.name
          .split('-')
          .map(str => str[0].toUpperCase() + str.slice(1))
          .join(' ')
      : 'Commoners App',
  }) as Partial<ResolvedConfig>

  o.hooks = await resolveHooks(hooks, hooksOverride) // Default hooks

  if (o.outDir && !isAbsolute(o.outDir))
    o.outDir = validatePath(o.outDir, o.root, 'output directory') // Ensure outDir is absolute

  // Classify extensions and merge into plugins/services
  const classified = extensions ? classifyExtensions(extensions) : { plugins: {}, services: {} }

  const mergedPlugins: Record<string, Plugin> = { ...(plugins ?? {}), ...classified.plugins }
  const mergedUserServices: Record<string, any> = {
    ...((ogServices as Record<string, any>) ?? {}),
    ...classified.services,
  }

  o.vite = vite ?? {} // Transfer the original Vite config

  o.target = await ensureTargetConsistent(o.target)

  if (!o.electron) o.electron = {}

  // Set default values for certain properties shared across config and package.json
  if (!o.icon) o.icon = join(templateDir, 'icon.png')

  if (!o.version) o.version = '0.0.0'

  if (!o.appId) o.appId = `com.${o.name.replace(/\s/g, '').toLowerCase()}.app`

  // Always have a build options object
  if (!o.build) o.build = {}

  // Resolve pages
  if (!o.pages) o.pages = {}

  o.pages = Object.entries(o.pages).reduce((acc, [id, filepath]) => {
    // Validate page paths to prevent traversal
    const absolutePath = getAbsolutePath(root, filepath)
    acc[id] = validatePath(absolutePath, root, `page "${id}"`)
    return acc
  }, {})

  const { target } = o

  // Check whether the selected services are valid
  if (services) {
    const selectedServices =
      typeof services === 'string'
        ? [services]
        : Array.isArray(services)
          ? services
          : Object.keys(services)
    const allServices = Object.keys(mergedUserServices)
    if (selectedServices) {
      if (!selectedServices.every(name => allServices.includes(name))) {
        const invalidServices = selectedServices.filter(name => !allServices.includes(name))
        throw new ValidationError(
          'Invalid service selection',
          `Unknown services: ${invalidServices.join(', ')}. Available services: ${allServices.join(', ')}`
        )
      }
    }
  }

  const resolvedServices = await resolveAll(mergedUserServices, {
    target,
    build,
    services,
    root: o.root,
  })

  // Build canonical extensions record from merged plugins + resolved services
  const resolvedExtensions: ResolvedExtensions = {}

  for (const [id, plugin] of Object.entries(mergedPlugins)) {
    resolvedExtensions[id] = {
      type: 'plugin',
      capabilities: (plugin as any).capabilities,
      plugin: plugin as Plugin,
    }
  }

  for (const [id, service] of Object.entries(resolvedServices)) {
    if (resolvedExtensions[id]) {
      // Same ID exists as plugin — this is a hybrid extension
      resolvedExtensions[id].type = 'hybrid'
      resolvedExtensions[id].service = service
      // Merge capabilities (service caps may have runtime/platform info)
      if (service.capabilities) {
        resolvedExtensions[id].capabilities = {
          ...resolvedExtensions[id].capabilities,
          ...service.capabilities,
        }
      }
    } else {
      resolvedExtensions[id] = {
        type: 'service',
        capabilities: service.capabilities,
        service,
      }
    }
  }

  o.extensions = resolvedExtensions

  // Generate declarative service manifest
  const { extname } = await import('node:path')
  const serviceManifest: Record<string, import('./types.js').ServiceManifestEntry> = {}
  for (const [id, ext] of Object.entries(resolvedExtensions)) {
    if (!ext.service) continue
    const svc = ext.service
    const isWasm = !!(svc as any).__wasm || (svc as any).type === 'wasm'
    const fp = svc.filepath
    const svcExt = fp ? extname(fp) : ''
    serviceManifest[id] = {
      src: svc.__src || undefined,
      filepath: fp || undefined,
      compile: svc.__compile,
      autobuild: svc.__autobuild,
      executable: !isWasm && (svcExt === '.exe' || svcExt === '' || !svcExt),
      wasm: isWasm,
      capabilities: svc.capabilities,
    }
  }
  o.serviceManifest = serviceManifest

  Object.defineProperty(o, '__resolved', { value: true, writable: false }) // Resolution flag
  return o as ResolvedConfig
}

const writePackageJSON = (o, root = '') =>
  writeFileSync(join(root, 'package.json'), JSON.stringify(o, null, 2)) // Will not update userPkg—but this variable isn't used for the Electron process

// Ensure project can handle --desktop command.
// Writes a package.json into the outDir (temp directory) instead of modifying the host
// project's package.json. This avoids polluting the user's repo with transient state
// and eliminates stale "main" fields if the build crashes before cleanup.
export const configureForDesktop = (outDir, root = '', defaults = {}) => {
  const userPkg = getJSON(join(root, 'package.json'))

  const pkg = {
    ...defaults,
    ...userPkg,
    main: 'main.cjs', // Entry point relative to outDir
  }

  // Resolve outDir to absolute if needed
  const absoluteOutDir = isAbsolute(outDir) ? outDir : resolve(root || process.cwd(), outDir)

  // Write the Electron package.json into the temp outDir, not the host root
  mkdirSync(absoluteOutDir, { recursive: true })
  writePackageJSON(pkg, absoluteOutDir)

  return {
    reset: () => {}, // No host file was modified — nothing to reset
  }
}

export const createServices = (services: ResolvedServices, opts: ServiceCreationOptions = {}) =>
  createAll(services, opts)

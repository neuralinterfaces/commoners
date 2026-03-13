// Built-In Modules
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  dirname,
  extname,
  join,
  relative,
  isAbsolute,
  resolve,
  normalize,
  sep,
  posix,
  basename,
} from 'node:path'
import { createRequire } from 'node:module'

// Internal Imports
import { resolveConfigPath } from '../index.js'
import { createNoOpHooks } from '../ui.js'
import { copyAsset } from './copy.js'
import { encodePath } from './encode.js'
import { isDesktop, rootDir, vite } from '../globals.js'
import { spawnProcess } from './processes.js'
import { BuildError } from '../errors.js'
import { createLogger } from '../assets/utils/logger.js'
import {
  ResolvedConfig,
  ResolvedService,
  PackageBuildInfo,
  ServiceRebuildOption,
} from '../types.js'
import { getPlugins, getServices } from './extensions.js'
import { withExternalBuiltins } from '../vite/plugins/electron/inbuilt.js'
import { getAllIcons } from '../assets/utils/icons.js'

import { importMetaResolvePlugin, nativeNodeModulesPlugin } from './esbuild/plugins.js'
import { getEnvFilesForMode, tryStatSync } from '../assets/services/env/utils.js'

const logger = createLogger('assets')

const CONFIG_EXTENSION_TARGETS = [
  '.cjs',
  '.mjs', // Fails for Node.js dependencies (e.g. @commoners/solidarity)
]

type ESBuildBuildOptions = import('esbuild').BuildOptions

type AssetMetadata = {
  extraResource?: boolean
  sign?: boolean
  isDirectory?: boolean // Whether the asset is a directory (useful for items created after registration)
}

type BuildInfo = {
  src: string
  out: string
}

type BuildOutput = string | undefined
type BuildFunction = (info: BuildInfo) => Promise<BuildOutput> | BuildOutput

type CoreAssetInfo =
  | string
  | ({
      input: string
      output?: string
      force?: boolean
      compile?: BuildFunction // Function to compile the asset
    } & AssetMetadata)

type AssetInfo = CoreAssetInfo | { text: string; output: string }

type AssetOutput = { file: string } & AssetMetadata

type AssetsCollection = {
  copy: CoreAssetInfo[]
  bundle: AssetInfo[]
}

const getAbsolutePath = (root: string, path: string) => (isAbsolute(path) ? path : join(root, path))

// Intelligently build service only if it hasn't been built yet (unless forced)
const mustBuild = ({ out, force }) => {
  const hasBeenBuilt = existsSync(out)
  if (hasBeenBuilt && !force) return false
  return true
}

const getBuildDir = (outDir: string) => join(resolve(outDir), 'assets')

const sharedWithElectron = ['commoners.config.cjs']

export const getAssetBuildPath = (
  assetPath: string,
  outDir: string,
  isSharedWithElectron?: boolean
) => {
  const inputToCompare = assetPath.replaceAll(sep, posix.sep)
  if (isSharedWithElectron === undefined)
    isSharedWithElectron = sharedWithElectron.includes(inputToCompare)
  if (isSharedWithElectron) return join(getBuildDir(outDir), assetPath) // Ensure consistently resolved by Electron
  const buildDir = getBuildDir(outDir)
  const encoded = encodePath(assetPath)
  return join(buildDir, encoded)
}

export const getAssetLinkPath = (path, outDir, root = outDir) => {
  // Get the absolute path of the asset
  const absOutPath = getAssetBuildPath(path, outDir)
  const resolvedRoot = resolve(root)

  // Get the relative path of the asset
  let outPath = normalize(relative(resolvedRoot, absOutPath))
  if (!(outPath[0] === sep)) outPath = sep + outPath
  if (!(outPath[0] === '.')) outPath = '.' + outPath
  const result = outPath.replaceAll(sep, posix.sep)
  return result
}

export const packageFile = async (info: PackageBuildInfo, _hooks = createNoOpHooks()) => {
  const { src, out, force } = info

  const outDir = dirname(out)

  const shouldBuild = mustBuild({ out: outDir, force })

  if (!shouldBuild) return { built: false, outDir }

  // Use Node.js Single Executable Application (SEA) instead of pkg
  const { createSEA } = await import('./sea.js')

  const result = await createSEA({
    src,
    out,
    force,
    sign: true,
  })

  if (!result.success) {
    throw new BuildError(
      'SEA executable creation failed',
      `Failed to create Single Executable Application: ${result.error}. Source: ${src}, Output: ${out}`
    )
  }

  return { built: true, outDir } // Return the output directory
}

async function buildService(
  {
    build,
    out,
    src,
    root,
  }: {
    src: string
    out: string
    build: ResolvedService['build']
    root: ResolvedConfig['root']
  },
  name,
  force = false,
  hooks = createNoOpHooks()
) {
  out = resolve(out)
  const buildInfo = { name, src, out, force }

  logger.debug('Emitting service:build:start', { service: name, src, out })
  hooks.emit({ type: 'service:build:start', service: name, src, out })

  try {
    const startTime = performance.now()

    // Dynamic Configuration
    let wasBuilt = null
    let fromFunction = false
    if (typeof build === 'function') {
      fromFunction = true
      const ctx = {
        package: async arg => {
          const result = await packageFile(arg, hooks)
          wasBuilt = result.built
          return result.outDir
        },
      }

      build = await build.call(ctx, buildInfo)
      if (!build) return // No file emitted
    }

    // Handle string build commands
    if (typeof build === 'string') {
      // Output path
      if (existsSync(build)) {
        const endTime = performance.now()
        if (typeof wasBuilt === 'boolean' && !wasBuilt) {
          logger.debug('Emitting service:build:cached', { service: name, src, out: build })
          hooks.emit({ type: 'service:build:cached', service: name, src, out: build })
        } else {
          logger.debug('Emitting service:build:end', {
            service: name,
            src,
            out: build,
            duration: endTime - startTime,
          })
          hooks.emit({
            type: 'service:build:end',
            service: name,
            src,
            out: build,
            duration: endTime - startTime,
          })
        }
        return build // NOTE: Can be resolved by the above build function
      }

      // Stop if the build is not required.
      // Always re-run commands from custom build functions — they handle their
      // own caching (e.g. Cargo) and the binary copy must be refreshed.
      if (!fromFunction && !mustBuild({ out, force })) {
        logger.debug('Emitting service:build:cached', { service: name, src, out })
        return hooks.emit({ type: 'service:build:cached', service: name, src, out })
      }

      // Terminal Command
      await spawnProcess(build, [], { cwd: root, label: name }, hooks)
      const endTime = performance.now()
      logger.debug('Emitting service:build:end', {
        service: name,
        src,
        out,
        duration: endTime - startTime,
      })
      hooks.emit({
        type: 'service:build:end',
        service: name,
        src,
        out,
        duration: endTime - startTime,
      })
    }

    // Auto Build Configuration
    else {
      const { built } = await packageFile(buildInfo, hooks)
      const endTime = performance.now()
      if (built) {
        logger.debug('Emitting service:build:end', {
          service: name,
          src,
          out,
          duration: endTime - startTime,
        })
        hooks.emit({
          type: 'service:build:end',
          service: name,
          src,
          out,
          duration: endTime - startTime,
        })
      } else {
        logger.debug('Emitting service:build:cached', { service: name, src, out })
        hooks.emit({ type: 'service:build:cached', service: name, src, out })
      }
    }
  } catch (error) {
    logger.debug('Emitting service:build:error', {
      service: name,
      src,
      out,
      error: (error as Error).message,
    })
    hooks.emit({ type: 'service:build:error', service: name, src, out, error })
    throw error // Re-throw the error for further handling
  }
}

// Derive assets to be transferred to the Commoners folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...
export const getAppAssets = async (
  resolvedConfig: ResolvedConfig,
  dev = false,
  runtimeOutDir?: string
) => {
  const { root, target } = resolvedConfig
  const outDir = runtimeOutDir ?? resolvedConfig.outDir

  // Ensure required parameters are defined
  if (!root || !outDir) {
    throw new BuildError(
      'Missing required configuration',
      `root and outDir must be defined. Got root=${root}, outDir=${outDir}`
    )
  }

  const configPath = resolveConfigPath(root)

  // Transfer configuration file and related services
  const assets: AssetsCollection = {
    copy: [],
    bundle: [],
  }

  // Create Config
  assets.bundle.push(
    ...CONFIG_EXTENSION_TARGETS.map(ext => {
      const output = `commoners.config${ext}`
      return configPath
        ? { input: configPath, output }
        : { text: ext === '.cjs' ? 'module.exports = {default: {}}' : 'export default {}', output }
    })
  )

  // Bundle onload script for the browser
  assets.bundle.push({
    input: join(rootDir, 'assets', 'onload.ts'),
    output: 'onload.mjs',
  })

  // Bundle environment files compatible with Vite (Desktop Only)
  if (isDesktop(target)) {
    const envFiles = getEnvFilesForMode('production', root)
    const existingEnvFiles = envFiles.filter(file => tryStatSync(file)?.isFile())
    assets.copy.push(
      ...existingEnvFiles.map(file => ({
        input: file,
        output: join(outDir, basename(file)),
        force: true, // Ensure strict output location
      }))
    )
  }

  // Copy All Icons
  if (resolvedConfig.icon && root)
    assets.copy.push(
      ...getAllIcons(resolvedConfig.icon)
        .filter(icon => icon)
        .map(icon => getAbsolutePath(root, icon))
    )

  // Handle Provided Plugins
  const plugins = getPlugins(resolvedConfig.extensions)
  for (const [id, plugin] of Object.entries(plugins)) {
    const pluginAssets = { ...(plugin.assets ?? {}) }

    // Only bundle assets in production mode
    if (!dev)
      Object.entries(pluginAssets).map(([key, assetSrc]) => {
        // Skip undefined or null assets
        if (!assetSrc || !root) return

        // Skip HTML files for bundling or copying
        // Handle in the main Vite build process instead
        if (extname(assetSrc) === '.html') return (pluginAssets[key] = assetSrc)

        const absPath = getAbsolutePath(root, assetSrc)

        const filename = basename(assetSrc)
        if (!filename || !id || !key) return // Skip if any component is invalid
        const assetPath = join('plugins', id, key, filename)
        const outPath = getAssetBuildPath(assetPath, outDir, true) // Always resolve in a way that's consistent with Electron
        const extension = extname(filename)

        const chosenAssetGroup =
          extension.includes('js') || extension.includes('ts') ? assets.bundle : assets.copy
        chosenAssetGroup.push({
          input: absPath,
          output: outPath,
          force: true, // Ensure strict output location
        })

        pluginAssets[key] = outPath
      })

    // NOTE: Need to reassign to the same object in case exported from a module
    if (plugin.assets) {
      for (const key of Object.keys(pluginAssets)) plugin.assets[key] = pluginAssets[key] // Add all new assets
    }
  }

  return assets
}

const resolveAssetInfo = (info, outDir, root) => {
  const isString = typeof info === 'string'
  const output = isString ? null : info.output
  const input = isString ? info : info.input
  const force = isString ? false : info.force
  const compile = isString ? false : info.compile

  const hasExplicitInput = typeof input === 'string'

  return {
    input,
    output: hasExplicitInput
      ? typeof output === 'string'
        ? force
          ? output
          : getAssetBuildPath(output, outDir)
        : getAssetBuildPath(getAbsolutePath(root, input), outDir)
      : output,
    force,
    compile,
  }
}

export const getServicesToBuild = (resolvedConfig: ResolvedConfig, dev = false) => {
  const resolvedServices = getServices(resolvedConfig.extensions)
  const servicesToBuild = Object.keys(resolvedServices).filter(name => {
    const { __src, __compile, __autobuild } = resolvedServices[name]
    if (dev && !__compile && !__autobuild) return false // Skip services that don't have an original source or final filepath
    if (!__src) return false // Skip if source is undefined
    return true
  })

  return servicesToBuild
}

export const getServiceAssets = (
  resolvedConfig: ResolvedConfig,
  dev = false,
  rebuildServices: ServiceRebuildOption = true,
  hooks = createNoOpHooks()
) => {
  const { root } = resolvedConfig

  // Transfer configuration file and related services
  const assets: AssetsCollection = {
    copy: [],
    bundle: [],
  }

  // Handle Provided Services
  const resolvedServices = getServices(resolvedConfig.extensions)
  const servicesToBuild = getServicesToBuild(resolvedConfig, dev)
  if (servicesToBuild.length === 0) return assets // No services to build

  for (const name of servicesToBuild) {
    const resolvedService = resolvedServices[name] as ResolvedService & {
      __src?: string
      __autobuild?: boolean
    }

    const { build, base, filepath, __src, __autobuild, ssl } = resolvedService

    // WASM services: copy pkg/ output into web assets directory (not extraResources)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal __wasm marker not on public type
    if ((resolvedService as any).__wasm || (resolvedService as any).type === 'wasm') {
      if (filepath) {
        assets.copy.push({
          input: filepath,
          output: join('services', name),
          force: true,
        })
      }
      continue
    }

    // Include SSL certificate files as extra resources for desktop builds
    if (ssl && !dev) {
      if (ssl.__keySource) {
        assets.copy.push({
          input: ssl.__keySource,
          // Output relative to build dir, will be placed in extraResources
          output: join('ssl', basename(ssl.__keySource)),
          extraResource: true,
        })
      }
      if (ssl.__certSource) {
        assets.copy.push({
          input: ssl.__certSource,
          // Output relative to build dir, will be placed in extraResources
          output: join('ssl', basename(ssl.__certSource)),
          extraResource: true,
        })
      }
    }

    const allowCompilation = !(dev && __autobuild)

    const bundleConfig: CoreAssetInfo & { compile?: BuildFunction } = {
      input: __src,
      output: filepath,
      force: true,
    }

    // Compile service when not in development mode or when the service is not autobuilt
    if (allowCompilation) {
      bundleConfig.compile = async function ({ src, out }) {
        logger.debug('Emitting service:build', { service: name, src, out, method: 'compile' })
        hooks.emit({ type: 'service:build', service: name, src, out, method: 'compile' })

        const rebuild =
          typeof rebuildServices === 'boolean' ? rebuildServices : rebuildServices.includes(name)

        // Detect when to package into an executable source
        const output = await buildService(
          {
            src,
            build,
            out,
            root,
          },
          name,
          rebuild, // Force rebuild if specified
          hooks
        )

        const toCopy = output === null ? null : (output ?? base ?? filepath)

        if (!existsSync(toCopy)) {
          logger.debug('Emitting service:build:error', {
            service: name,
            src,
            out,
            missingFile: toCopy,
          })
          hooks.emit({
            type: 'service:build:error',
            service: name,
            src,
            out,
            error: new Error(`Missing build file: ${toCopy}`),
          })
          return null // Do not try to copy or bundle the missing file
        }

        return toCopy
      }
    }

    assets.bundle.push(bundleConfig)
  }

  return assets
}

export const buildAssets = async (
  assets: AssetsCollection,
  {
    outDir,
    root,
    target,
    dev = false,
  }: {
    outDir: string
    root: string
    target
    dev?: boolean
  }
) => {
  const _vite = await vite

  const isDesktopTarget = isDesktop(target)
  mkdirSync(outDir, { recursive: true }) // Ensure asset output directory exists

  const outputs: AssetOutput[] = []

  const toCompile = assets.bundle.filter(o => o.compile)
  const toBundle = assets.bundle.filter(o => !o.compile)

  // Serially resolve services
  for (const info of toCompile) {
    const resolvedInfo = resolveAssetInfo(info, outDir, root)
    const { input, output, compile } = resolvedInfo

    const result = await compile({ src: input, out: output })

    if (!result)
      continue // Skip if no result
    // Copy results.
    else if (existsSync(result)) {
      if (!dev && isDesktopTarget)
        assets.copy.push({ input: result, output, extraResource: true, sign: true })
    }

    // Or attempt auto-bundle
    else toBundle.push({ ...resolvedInfo, extraResource: true, sign: true })
  }

  // Create an assets folder with copied assets (ESM)
  await Promise.all(
    toBundle.map(async info => {
      // Just copy text to the output file
      if (typeof info !== 'string' && 'text' in info) {
        const { output } = info
        if (typeof output === 'string') {
          const outPath = getAssetBuildPath(output, outDir)
          mkdirSync(dirname(outPath), { recursive: true }) // Ensure base and asset output directory exists
          return writeFileSync(outPath, info.text)
        } else return // Nowhere to write the text
      }

      const { input, output } = resolveAssetInfo(info, outDir, root)

      // Transform an input file in some way
      const inputExt = extname(input)
      const fileRoot = dirname(input)

      // Bundle HTML Files using Vite
      if (inputExt === '.html') {
        const outDir = dirname(output)

        await _vite.build({
          logLevel: 'silent',
          base: './',
          root: fileRoot,
          build: {
            emptyOutDir: false, // Ensure assets already built are maintained
            outDir, // Configure the output directory of the linked build assets
            rollupOptions: {
              input,
            },
          },
        })
      }

      // Use ESBuild for specific files only
      else {
        const outputExtension = extname(output)

        if (basename(input, extname(input)) == 'commoners.config')
          await bundleConfig(input, output, {
            node: outputExtension === '.cjs',
            desktop: isDesktopTarget,
            target,
          })
        else {
          // Externalize packages that cannot be bundled: Electron runtime,
          // native .node addons, and optional dependencies that may not be
          // installed.  platform: 'node' auto-externalizes Node built-ins
          // (fs, path, etc.) but NOT these.
          const assetExternals = ['electron', '*.node', '@aws-sdk/*']

          const baseConfig: ESBuildBuildOptions = {
            entryPoints: [input],
            bundle: true,
            logLevel: 'silent',
            outfile: output,
          }

          // Force a build format if the proper extension is specified
          const format =
            outputExtension === '.mjs' ? 'esm' : outputExtension === '.cjs' ? 'cjs' : undefined

          const esbuild = await import('esbuild')

          const buildForNode = () =>
            buildForBrowser({
              outfile: output,
              platform: 'node',
              external: assetExternals,
              plugins: [nativeNodeModulesPlugin()],
            })

          const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts })

          if (outputExtension === 'cjs') await buildForNode()
          else await buildForBrowser().catch(buildForNode) // Externalize all node dependencies
        }

        // Handle extra resources
        const assetOutputInfo: AssetOutput = { file: output }
        if (typeof info === 'object') {
          assetOutputInfo.extraResource = info.extraResource
          assetOutputInfo.sign = info.sign
        }

        outputs.push(assetOutputInfo)
      }
    })
  ).catch(error => {
    throw new BuildError(
      'Asset build failed',
      `Failed to build assets: ${error.message}. Stack: ${error.stack}`
    )
  })

  // Copy static assets
  assets.copy.map(info => {
    const isObject = typeof info === 'object'
    const file = isObject ? info.input : info
    const locationToEncode = (isObject ? info.output : undefined) ?? file
    const extraResource = isObject ? info.extraResource : false
    const forceSpecifiedLocation = extraResource || (isObject && info.force)

    // Ensure extra resources are copied to the output directory
    const outputLocation = forceSpecifiedLocation
      ? locationToEncode
      : getAssetBuildPath(locationToEncode, outDir)
    const isContained = outputLocation.startsWith(file) // Avoid duplication
    const output: AssetOutput = { file: isContained ? file : copyAsset(file, outputLocation) }

    // Handle extra resources
    if (isObject) {
      output.extraResource = extraResource
      output.sign = info.sign
    }

    outputs.push(output)
  })

  return outputs
}

// Properties consumed by each runtime context.
// Browser (.mjs): only plugins are read from the config import (onload.ts).
// Electron (.cjs): main process reads name, icon, electron, plugins, services, hooks.
const BROWSER_CONFIG_KEYS = ['plugins']
const ELECTRON_CONFIG_KEYS = ['name', 'icon', 'electron', 'plugins', 'services', 'hooks']

// Keys to strip from each runtime context.
// Browser strips: Electron-specific hooks + service internals + build-time only props
// Electron strips: browser-only lifecycle hooks + build-time only props
const BROWSER_STRIP_KEYS = [
  'desktop',
  'src',
  'url',
  'port',
  'build',
  'publish',
  'ssl',
  'env',
  'assets',
]
// NOTE: `assets` is NOT stripped from Electron — main process reads plugin.assets for protocol handler
// Only strip renderer-side keys from Electron config — the main process needs
// start/ready/quit/isSupported to run the plugin lifecycle.
const ELECTRON_STRIP_KEYS = ['load']

/**
 * Generate a wrapper module that imports the real config and re-exports
 * only the properties consumed by the target runtime.
 */
function generateStrippedEntry(configImportPath: string, node: boolean): string {
  const keepKeys = node ? ELECTRON_CONFIG_KEYS : BROWSER_CONFIG_KEYS
  const propsExpr = keepKeys.map(k => `${k}: _cfg.${k}`).join(', ')

  // Strip irrelevant keys from plugin/extension/service objects per runtime.
  const stripKeys = node ? ELECTRON_STRIP_KEYS : BROWSER_STRIP_KEYS

  return [
    `import _cfg from '${configImportPath}';`,
    // Strip extensions at the property level so hybrid extensions only carry
    // the properties relevant to this runtime context.
    `function _stripExt(exts) {`,
    `  if (!exts || typeof exts !== 'object') return exts;`,
    `  var out = {};`,
    `  for (var id in exts) {`,
    `    var ext = exts[id];`,
    `    if (typeof ext !== 'object' || ext === null) { out[id] = ext; continue; }`,
    `    var s = {};`,
    `    for (var k in ext) {`,
    // Keep the property if it's NOT in the strip list (i.e. keep unknown keys too)
    `      if (${JSON.stringify(stripKeys)}.indexOf(k) === -1) s[k] = ext[k];`,
    `    }`,
    `    out[id] = s;`,
    `  }`,
    `  return out;`,
    `}`,
    `var _out = { ${propsExpr} };`,
    // Apply per-property stripping to plugins/extensions
    `if (_out.plugins) _out.plugins = _stripExt(_out.plugins);`,
    `if (_out.extensions) _out.extensions = _stripExt(_out.extensions);`,
    // For Electron: also strip plugin-side keys from services
    ...(node ? [`if (_out.services) _out.services = _stripExt(_out.services);`] : []),
    `export default _out;`,
  ].join('\n')
}

export const bundleConfig = async (
  input,
  outFile,
  { node = false, desktop = false, target = '' } = {}
) => {
  const _vite = await vite

  const logLevel = 'silent'
  const outDir = dirname(outFile)
  const outFileName = basename(outFile)
  const extension = extname(outFile)

  const format = extension === '.mjs' ? 'es' : extension === '.cjs' ? 'cjs' : undefined

  const plugins = []

  const root = dirname(input)

  // --- Automatic config stripping ---
  // Generate a temp entry that imports the real config and re-exports only the
  // properties consumed by this runtime context. This prevents leaking service
  // configuration (build commands, ports, file paths) into browser bundles and
  // keeps Electron bundles free of browser-only config.
  const configImportPath = input.replace(/\\/g, '/') // Normalize Windows paths
  const strippedEntryPath = join(
    root,
    `.commoners-config-entry${extension === '.cjs' ? '.cjs' : '.mjs'}`
  )
  writeFileSync(strippedEntryPath, generateStrippedEntry(configImportPath, node))

  // For browser targets, provide lightweight aliases for common Node.js built-ins.
  // We avoid vite-plugin-node-polyfills because it pulls in node-stdlib-browser which
  // includes crypto-browserify → elliptic (vulnerable, unnecessary for browser targets).
  // Desktop (Electron) has native Node.js — only process needs to be excluded there
  // since the preload script provides it.
  // Shim for node:url — provides fileURLToPath for browser context.
  // URL/URLSearchParams are globally available in all modern browsers.
  const nodeUrlShimId = '\0node-url-shim'
  const nodeUrlShimCode = `
    export function fileURLToPath(url) {
      if (typeof url === 'string') return url.startsWith('file://') ? url.slice(7) : url;
      return url?.pathname || url?.href?.slice(7) || String(url);
    }
    export function pathToFileURL(p) { return new globalThis.URL('file://' + p); }
    export const URL = globalThis.URL;
    export const URLSearchParams = globalThis.URLSearchParams;
    export default { fileURLToPath, pathToFileURL, URL, URLSearchParams };
  `

  const nodeAliases: Record<string, string> = node
    ? {}
    : (() => {
        const _require = createRequire(import.meta.url)

        // Resolve browser polyfills. In pnpm strict mode, these may not be
        // hoisted to the bundled dist location. Fall back to resolving from
        // the @commoners/solidarity package entry which has them as direct deps.
        const resolvePolyfill = (id: string) => {
          try {
            return _require.resolve(id)
          } catch {
            const fallback = createRequire(_require.resolve('@commoners/solidarity'))
            return fallback.resolve(id)
          }
        }

        const pathBrowserify = resolvePolyfill('path-browserify')
        const processBrowser = resolvePolyfill('process/browser')
        return {
          path: pathBrowserify,
          'node:path': pathBrowserify,
          'node:url': nodeUrlShimId,
          ...(!desktop ? { process: processBrowser } : {}),
        }
      })()

  // Externalize Node built-ins that don't have browser equivalents and aren't
  // used in config bundles. Keep node:url and node:path aliased above.
  const nodeExternals = node
    ? []
    : [
        'os',
        'dgram',
        'fs',
        'child_process',
        'net',
        'tls',
        'http',
        'https',
        'crypto',
        'stream',
        'zlib',
        'dns',
        'cluster',
        'module',
        'node:os',
        'node:fs',
        'node:child_process',
        'node:net',
        'node:tls',
        'node:http',
        'node:https',
        'node:crypto',
        'node:stream',
        'node:zlib',
        'node:dns',
        'node:cluster',
        'node:module',
        'node:dgram',
      ]

  const config = _vite.defineConfig({
    configFile: false, // Block loading any user-defined vite.config.ts file

    logLevel,
    base: './',
    root,

    plugins: [
      ...plugins,
      // Virtual module plugin to serve the node:url shim
      ...(node
        ? []
        : [
            {
              name: 'node-url-shim',
              resolveId(id) {
                return id === nodeUrlShimId ? id : null
              },
              load(id) {
                return id === nodeUrlShimId ? nodeUrlShimCode : null
              },
            },
          ]),
    ],

    // User-facing target guards for dead-code elimination in config files.
    // Usage: if (__COMMONERS_DESKTOP__) { /* desktop-only plugin */ }
    // Targets: web, desktop, mobile (universal) + electron, tauri, ios, android (subtargets)
    define: {
      __COMMONERS_TARGET__: JSON.stringify(target),
      __COMMONERS_DESKTOP__: JSON.stringify(desktop),
      __COMMONERS_MOBILE__: JSON.stringify(
        target === 'mobile' || target === 'ios' || target === 'android'
      ),
      __COMMONERS_WEB__: JSON.stringify(target === 'web' || target === 'pwa'),
      __COMMONERS_ELECTRON__: JSON.stringify(target === 'electron' || target === 'desktop'),
      __COMMONERS_TAURI__: JSON.stringify(target === 'tauri'),
      __COMMONERS_IOS__: JSON.stringify(target === 'ios'),
      __COMMONERS_ANDROID__: JSON.stringify(target === 'android'),
    },

    resolve: {
      alias: nodeAliases,
    },

    build: {
      lib: {
        entry: strippedEntryPath,
        formats: [format],
        fileName: () => outFileName,
      },
      emptyOutDir: false,
      outDir,

      rollupOptions: {
        external: nodeExternals,
        plugins: [
          importMetaResolvePlugin(), // Ensure import.meta.url is resolved correctly within each source file
          // Fix inter-chunk imports on Windows: Vite/Rollup may generate absolute
          // paths lacking the drive letter (e.g. /examples/demo/...) for code-split
          // chunks. Since all chunks share the same outDir, rewrite to relative.
          {
            name: 'fix-windows-chunk-paths',
            renderChunk(code: string) {
              // Match import/export from paths and dynamic import() paths that
              // start with "/" — these are broken on Windows (no drive letter).
              const fixed = code.replace(
                /((?:from|import)\s*\(\s*['"]|from\s+['"])(\/[^'"]+)(['"])/g,
                (_match, prefix, absPath, suffix) => {
                  const filename = absPath.substring(absPath.lastIndexOf('/') + 1)
                  return prefix + './' + filename + suffix
                }
              )
              return fixed !== code ? fixed : null
            },
          },
        ],
      },
    },
  })

  const resolvedConfig = node ? withExternalBuiltins(config) : config

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vite build() returns RollupOutput | RollupOutput[]
  let results: any[]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cast needed for RollupOutput[]
    results = (await _vite.build(resolvedConfig)) as any[]
  } finally {
    // Clean up the temp stripped-config entry file
    try {
      unlinkSync(strippedEntryPath)
    } catch {
      /* ignore cleanup errors */
    }
  }

  // Always return a flat list of the output file locations
  return results
    .map(({ output }) => output)
    .flat()
    .map(({ fileName }) => join(outDir, fileName))
}

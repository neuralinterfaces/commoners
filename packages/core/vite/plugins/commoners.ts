import { extname, resolve, dirname, join, relative, sep, posix } from 'node:path'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

import { getIcon } from '../../assets/utils/icons.js'

import { getSpecificTarget, isDesktop, isMobile, vite } from '../../globals.js'

import { getAssetLinkPath } from '../../utils/assets.js'
import { ResolvedConfig } from '../../types.js'

import { sanitize } from '../../assets/services/index.js'
import { getServices } from '../../utils/extensions.js'
import { getLocalIP } from '../../assets/services/ip.js'

const virtualModuleId = 'commoners:env'
const wasmVirtualModuleId = 'commoners:wasm'

const ENV_VAR_NAMES = [
  'NAME',
  'VERSION',
  'ICON',
  'SERVICES',

  'READY',
  'PLUGINS',
  'EXTENSIONS',

  'DESKTOP',
  'MOBILE',
  'WEB',

  'DEV',
  'PROD',

  'TARGET',
  'ENV',
  'PAGES',
  'ROOT',
  'CAPABILITIES',
]

const TAGS = {
  head: {
    start: '<head>',
    end: '</head>',
  },
}

type CommonersPluginOptions = {
  config: ResolvedConfig
  build: boolean
  dev: boolean
  env: Record<string, string>
}

export default async ({ config, build, dev, env }: CommonersPluginOptions) => {
  const { mergeConfig } = await vite

  const { outDir, target, pages } = config

  // Variables only resolved once for the main configuration
  const actualOutDir = outDir
  const desktop = isDesktop(target)
  const mobile = isMobile(target)

  const resolvedVirtualModuleId = '\0' + virtualModuleId
  const resolvedWasmVirtualModuleId = '\0' + wasmVirtualModuleId

  return {
    name: 'commoners',
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId
      if (id === wasmVirtualModuleId) return resolvedWasmVirtualModuleId
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        const lines = [
          'const __commoners = globalThis.commoners',
          ...ENV_VAR_NAMES.map(name => `export const ${name} = __commoners.${name}`),
          'export const query = __commoners.query',
          'export const api = __commoners.api',
          'export const bus = __commoners.bus',
          'export default __commoners',
        ]
        return lines.join('\n')
      }

      if (id === resolvedWasmVirtualModuleId) {
        return [
          'const _cache = new Map()',
          '',
          'export function isWasmService(service) {',
          '  return service && service.type === "wasm"',
          '}',
          '',
          'export async function loadWasmService(service) {',
          '  if (!isWasmService(service)) throw new Error("Not a WASM service")',
          '  const url = service.url',
          '  if (_cache.has(url)) return _cache.get(url)',
          '  const mod = await import(/* @vite-ignore */ url)',
          '  if (mod.default && typeof mod.default === "function") await mod.default()',
          '  _cache.set(url, mod)',
          '  return mod',
          '}',
        ].join('\n')
      }
    },

    handleHotUpdate(ctx) {
      if (!dev) return

      // Detect if the changed file is associated with a plugin
      const changedFile = ctx.file
      const pluginEntries = Object.entries(config.extensions || {})

      for (const [id, ext] of pluginEntries) {
        if (ext.type !== 'plugin' && ext.type !== 'hybrid') continue
        // Check if the changed file path contains the plugin ID (convention-based detection)
        if (changedFile.includes(`/plugins/${id}/`) || changedFile.includes(`\\plugins\\${id}\\`)) {
          // Signal the dev server to broadcast a reload for this plugin
          const server = ctx.server
          if (server.ws) {
            server.ws.send({
              type: 'custom',
              event: 'commoners:plugin:reload',
              data: { id },
            })
          }
          // Also broadcast via the commoners WebSocket server
          try {
            const wsPort = process.env.COMMONERS_WEBSOCKET_PORT
            if (wsPort) {
              // The WebSocket server is managed by start.ts — use a custom event to notify
              server.config.logger.info(`[commoners] Hot reloading plugin: ${id}`)
            }
          } catch {}
          break
        }
      }
    },

    transformIndexHtml(html, ctx) {
      const { path: htmlPath } = ctx
      const parent = dirname(htmlPath)

      const resolvedConfig = mergeConfig(config, {})
      // resolvedConfig.root = parent

      // Only use custom outDir if not in development
      const _assetOutDir = dev ? undefined : resolvedConfig?.outDir
      const assetOutDir = _assetOutDir ?? actualOutDir

      // Resolve paths per HTML file built
      const configRoot = resolvedConfig.root

      const root = _assetOutDir ? actualOutDir : configRoot

      const _relTo = build ? assetOutDir : root
      const relTo = join(_relTo, parent) // Resolve actual path in the assets
      const updatedConfigURL = getAssetLinkPath('commoners.config.mjs', assetOutDir, relTo)

      const services = sanitize(getServices(resolvedConfig.extensions))

      // Build EXTENSIONS and CAPABILITIES from canonical extensions record (single pass)
      const extensionsObject = {} as Record<string, any>
      const serviceCapabilities = {} as Record<string, any>
      const pluginCapabilities = {} as Record<string, any>

      for (const [id, ext] of Object.entries(resolvedConfig.extensions || {})) {
        const { type, capabilities } = ext
        extensionsObject[id] = { type, ...(capabilities ? { capabilities } : {}) }

        if (capabilities) {
          if (type === 'service') serviceCapabilities[id] = capabilities
          else if (type === 'plugin') pluginCapabilities[id] = capabilities
          else {
            // hybrid
            serviceCapabilities[id] = capabilities
            pluginCapabilities[id] = capabilities
          }
        }
      }

      const rawIconSrc = getIcon(resolvedConfig.icon)
      const resolvedIcon = rawIconSrc ? resolve(configRoot, rawIconSrc) : null
      const iconPath = resolvedIcon ? getAssetLinkPath(resolvedIcon, assetOutDir, relTo) : null

      const pathsRelativeToConfigurationFile = Object.entries(pages).reduce((acc, [id, path]) => {
        const relToCurrentPath = relative(configRoot, path) // Remove configuration path
        return { [id]: join(_relTo, relToCurrentPath), ...acc }
      }, {}) as Record<string, string>

      const globalObject = {
        NAME: resolvedConfig.name,
        VERSION: resolvedConfig.version,
        ICON: iconPath,
        SERVICES: services,

        // Provide page paths relative to the current file
        PAGES: Object.entries(pathsRelativeToConfigurationFile).reduce((acc, [id, path]) => {
          acc[id] = relative(relTo, path).replaceAll(sep, posix.sep)
          return acc
        }, {}),

        // Target Shortcuts
        TARGET: getSpecificTarget(target),
        DESKTOP: desktop,
        MOBILE: mobile,
        WEB: !desktop && !mobile,

        // Production vs Development
        DEV: dev ? `ws://${getLocalIP()}:${process.env.COMMONERS_WEBSOCKET_PORT}` : false,
        PROD: !dev,

        // Environment Variables
        ENV: env,

        ROOT: relative(relTo, root).replaceAll(sep, posix.sep),

        CAPABILITIES: {
          services: serviceCapabilities,
          plugins: pluginCapabilities,
        },

        EXTENSIONS: extensionsObject,
      }

      const faviconLink = rawIconSrc
        ? `<link rel="shortcut icon" href="${iconPath}" type="image/${extname(iconPath).slice(1)}" >`
        : ''

      // Inject required items into the HTML head
      const headStart = html.indexOf(TAGS.head.start)
      const headEnd = html.indexOf(TAGS.head.end)
      const headContent =
        headStart && headEnd ? html.slice(headStart + TAGS.head.start.length, headEnd) : ''
      const beforeHead = headStart ? html.slice(0, headStart) : ''
      const afterHead = headEnd ? html.slice(headEnd + TAGS.head.end.length) : ''

      const lowPriority = `
                <title>${resolvedConfig.name}</title>
                ${faviconLink}
            `

      const highPriority = `
                <script type="module">

                const { send, on, services, quit, close, args } = globalThis.__commoners ?? {} 

                const { __id } = args ?? {}

                // Double-escape backslashes so they survive the template literal.
                // On Windows, JSON.stringify produces paths like "C:\\Users\\..." where \\
                // is a JSON-escaped backslash. Inside a JS template literal, \\ is interpreted
                // as a single backslash, producing invalid JSON (e.g. unrecognized escape
                // sequences). Doubling the backslashes preserves them through the template.
                const GLOBAL = globalThis.commoners = JSON.parse(\`${JSON.stringify(globalObject).replaceAll('\\', '\\\\')}\`)
                if (services) GLOBAL.SERVICES = services // Replace with sanitized services from Electron if available
                if (GLOBAL.DESKTOP === true) GLOBAL.DESKTOP = { quit, close, ...args } // Ensure desktop is configured properly at the start

                GLOBAL.READY = new Promise(res => {
                    GLOBAL.__READY = (value) => {
                        res(value) // Resolve the promise
                        delete GLOBAL.__READY

                        if (on) on("commoners:window:ready:main:ping", () => send("commoners:window:ready:main:pong", __id)) // Respond to the main process ping
                        if (send) send("commoners:window:ready:renderer:pong", __id) // Notify the main process that the window is ready
                    }
                })  

                const { ROOT } = GLOBAL

                GLOBAL.PAGES = Object.entries(GLOBAL.PAGES).reduce((acc, [ id, relPath ]) => {
                    acc[id] = (info = {}) => {
                        const { search, hash } = info
                        const url = new URL(relPath, window.location.href)
                        if (search) url.search = search
                        if (hash) url.hash = hash
                        window.location.href = url.href
                    }

                    return acc
                }, {})

                // Directly import the plugins from the transpiled configuration object
                import("${updatedConfigURL}").then(o => {
                    const { plugins } = o.default
                    if (plugins) GLOBAL.__PLUGINS = plugins
                    import("${getAssetLinkPath('onload.mjs', assetOutDir, relTo)}")
                 })


            </script>\n
            `

      // Compute SHA-256 hash of the inline script body for CSP in production builds
      if (!dev) {
        const scriptMatch = highPriority.match(/<script type="module">([\s\S]*?)<\/script>/)
        if (scriptMatch) {
          const scriptBody = scriptMatch[1]
          const hash = createHash('sha256').update(scriptBody, 'utf8').digest('base64')
          const hashesPath = join(actualOutDir, 'script-hashes.json')
          mkdirSync(dirname(hashesPath), { recursive: true })
          writeFileSync(hashesPath, JSON.stringify({ inlineScriptHash: `'sha256-${hash}'` }))
        }
      }

      return `${beforeHead}${TAGS.head.start}${highPriority}${headContent}${lowPriority}${TAGS.head.end}${afterHead}`
    },
  }
}

import { existsSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { cpus } from 'node:os'

import {
  PLATFORM,
  ensureTargetConsistent,
  isMobile,
  isDesktop,
  globalWorkspacePath,
  chalk,
  vite,
} from './globals.js'
import { ConfigResolveOptions, LaunchConfig } from './types.js'
// Removed printFailure and printSubtle imports - using direct console calls
import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { createAll } from './assets/services/index.js'
import { createNoOpHooks } from './hooks.js'
import { resolveConfig } from './index.js'

type ViteServerOptions = import('vite').ServerOptions

const matchFile = (directory, extensions) => {
  if (!existsSync(directory)) return null
  return readdirSync(directory).find(file => {
    const fileExtension = extname(file)
    return extensions.some(ext => fileExtension === ext)
  })
}

const getDesktopPath = outDir => {
  let baseDir = ''
  let filename = null

  const platform = {
    mac: PLATFORM === 'mac',
    windows: PLATFORM === 'windows',
    linux: PLATFORM === 'linux',
  }

  if (platform.mac) {
    const isMx = /Apple\sM\d+/.test(cpus()[0].model)
    baseDir = join(outDir, `${PLATFORM}${isMx ? '-arm64' : ''}`)
    filename = matchFile(baseDir, ['.app'])
  } else if (platform.windows) {
    baseDir = join(outDir, `win-unpacked`)
    filename = matchFile(baseDir, ['.exe'])
  } else if (platform.linux) {
    baseDir = join(outDir, `linux-unpacked`)
    filename = matchFile(outDir, ['.AppImage', '.deb', '.rpm', '.snap'])
    if (filename) baseDir = outDir
    else {
      baseDir = join(outDir, `linux-unpacked`)
      filename = matchFile(baseDir, [''])
    }
  }

  const fullPath = filename && join(baseDir, filename)
  if (!fullPath || !existsSync(fullPath)) return null
  return fullPath
}

export const launchServices = async (
  config: LaunchConfig,
  opts?: { services: ConfigResolveOptions['services'] }
) => {
  const resolvedConfig = await resolveConfig(config, { ...opts, build: true })
  const { target, root, services } = resolvedConfig

  const serviceNames = Object.keys(services)
  if (!serviceNames.length) {
    console.error('No services specified.')
    process.exit(1)
  }

  // Ensure users can access the created services
  return await createAll(services, {
    root,
    target,
    services: true,
    build: true,
  })
}

export const resolveAppToLaunch = (config: LaunchConfig) => {
  const { root, outDir } = config
  if (outDir) return outDir // Use the specified output directory

  const { target } = config
  return join(root ?? '', globalWorkspacePath, target)
}

export const launchApp = async (config: LaunchConfig, args = []) => {

  const { outDir: originalOutDir, hooks = createNoOpHooks() } = config

  try {
    let { target } = config

    const { port, public: isPublic } = config

    if (originalOutDir && getDesktopPath(originalOutDir)) target = 'electron' // Autodetect Electron target

    target = await ensureTargetConsistent(target)
    const outDir = resolveAppToLaunch(config)

    hooks.emit({ type: 'launch:start', outDir, target })

    if (!existsSync(outDir)) throw new Error(`The expected output directory does not exist`)

    if (isMobile(target)) {
      process.chdir(outDir)
      await mobile.launch(target)
      // Opening native launcher silently
    } else if (isDesktop(target)) {
      const fullPath = getDesktopPath(outDir)

      if (!fullPath) throw new Error(`This application has not been built for ${PLATFORM} yet.`)

      let runExecutableCommand = 'open' // Default to macOS command

      const resolvedArgs = [`"${fullPath}"`] // The path to the executable file
      const userArgs = new Set([...args]) // User-provided arguments

      // Set the appropriate command based on the platform
      if (PLATFORM === 'windows' || PLATFORM === 'linux') runExecutableCommand = resolvedArgs.shift() // Run executable directly
      if (PLATFORM === 'linux') userArgs.add('--no-sandbox') // Ensure No Sandbox
      if (PLATFORM === 'mac' && userArgs.size) resolvedArgs.push('--args') // macOS-specific flag to pass additional arguments
      resolvedArgs.push(...userArgs) // Add any additional arguments

      // Command execution details omitted from core output
      await spawnProcess(runExecutableCommand, resolvedArgs, { env: process.env, label: "commoners-electron-launcher" }, hooks) // Share the same environment variables
   
    } else {
      const __vite = await vite

      const serverConfig = {
        port,

        open: !process.env.VITEST,
      } as ViteServerOptions

      if (isPublic) serverConfig.host = '0.0.0.0'

      const server = await __vite.createServer({
        configFile: false,
        root: outDir,
        server: serverConfig,
      })

      await server.listen()

      // Print out the URL if everything was initialized here (i.e. dev mode)
      const { port: resolvedPort, host: resolvedHost } = server.config.server
      const protocol = server.config.server.https ? 'https' : 'http'
      const url = `${protocol}://localhost:${resolvedPort}`
      // Server URL details omitted from core output

      return {
        url,
        server,
      }
    }

    return {}
  }

  catch (error) {
    hooks.emit({ type: 'launch:error', error })
  }

  finally {
    hooks.emit({ type: 'launch:ready' }) // Emit ready event with empty URL
  }
}

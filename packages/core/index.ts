// Built-In Modules
import { dirname, join, relative, normalize, resolve, isAbsolute } from 'node:path'
import { existsSync, unlink, writeFileSync } from 'node:fs'

// Internal Imports
import {
  globalWorkspacePath,
  getDefaultMainLocation,
  templateDir,
  ensureTargetConsistent,
  isMobile,
} from './globals.js'
import { onCleanup } from './cleanup.js'

import {
  ConfigResolveOptions,
  ResolvedConfig,
  ServiceCreationOptions,
  UserConfig,
} from './types.js'
import { resolveAll, createAll } from './assets/services/index.js'
import { resolveFile, getJSON } from './utils/files.js'
import merge from './utils/merge.js'
import { bundleConfig } from './utils/assets.js'
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
export { launchApp as launch, launchServices, resolveAppToLaunch } from './launch.js'
export { buildApp as build, buildServices } from './build.js'
export { app as start, services as startServices } from './start.js'
export { packageFile } from './utils/assets.js'
export { merge } // Other Helpers
export { Logger, LogLevel, createLogger, getLogger, configureLogger, setGlobalLogLevel, setGlobalUI, getGlobalUI } from './assets/utils/logger.js' // Logging

// ------------------ Configuration File Handling ------------------
export const resolveConfigPath = (base = '') =>
  resolveFile(join(base, 'commoners.config'), ['.ts', '.js'])

const isDirectory = (root: string) => lstatSync(root).isDirectory()

const isCommonersProject = async (root: string = process.cwd()) => {
  const rootExists = existsSync(root)

  let failMessage = ''

  // Root does not exist
  if (root && !rootExists) failMessage = `This path does not exist.`
  // No index.html file
  else if (!existsSync(join(root, 'index.html')))
    failMessage = `This directory does not contain an index.html file.`

  if (failMessage) {
    logger.error('Invalid Commoners project', { root, reason: failMessage })
    return false
  }

  return true
}

export async function loadConfigFromFile(root: string = resolveConfigPath()) {
  const rootExists = existsSync(root)

  if (existsSync(root)) {
    root = resolve(root) // Resolve to absolute path
    if (!isDirectory(root)) root = dirname(root) // Get the parent directory
  }

  const isValidProject = await isCommonersProject(root)

  if (!isValidProject) {
    throw new ConfigurationError(
      'Invalid Commoners project',
      `This directory does not contain an index.html file: ${root}`
    )
  }

  const configPath = resolveConfigPath(
    rootExists
      ? root // New root config
      : '' // Base config
  )

  const resolvedRoot = configPath ? dirname(configPath) : root || process.cwd()

  let config = {} as UserConfig // No user-defined configuration found

  if (configPath) {
    const configOutputPath = join(resolvedRoot, globalWorkspacePath, `commoners.config.mjs`)
    const outputFiles = await bundleConfig(configPath, configOutputPath, { node: true })

    const fileURL = pathToFileURL(configOutputPath).href

    try {
      config = (await import(fileURL)).default as UserConfig
    } finally {
      onCleanup(() => outputFiles.forEach(file => unlink(file, () => {})))
    }
  }

  // Set the root of the project (always absolute for consistent path resolution)
  config.root = resolvedRoot

  return config
}



export async function resolveConfig(
  o: UserConfig = {},
  {
    // Service Auto-Configuration
    build = false,
    dev: _dev = !build,

    // Advanced Service Configuration
    services,

    hooks: hooksOverride
  }: ConfigResolveOptions = {}
) {

  const isResolved = (o as Record<string, any>).__resolved

  if (isResolved) return o as ResolvedConfig
  

  // Mobile commands must always run from the root of the specified project
  if (isMobile(o.target) && o.root) {
    process.chdir(o.root)
    delete o.root
  }

  // Always use absolute root path for consistent path resolution
  const root = o.root ? (isAbsolute(o.root) ? o.root : resolve(o.root)) : process.cwd()
  o.root = root

  const { services: ogServices, plugins, vite, ...temp } = o

  const userPkg = getJSON(join(root, 'package.json'))

  // Merge Config and package.json (transformed name)
  const { 
    hooks, // Do not copy
    electron = {},
    ...rest 
  } = temp

  const { 
    hooks: electronHooks, // Do not copy
    ...electronRest 
  } = electron

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

  if (o.outDir && !isAbsolute(o.outDir)) {
    // Validate outDir to prevent path traversal
    o.outDir = validatePath(o.outDir, o.root, 'output directory')
  }

  o.plugins = plugins ?? {} // Transfer the original plugins
  o.services = (ogServices as Record<string, any>) ?? {} // Transfer original functions on publish
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
    const selectedServices = typeof services === 'string' ? [ services ] : ( Array.isArray(services) ? services : Object.keys(services) )
    const allServices = Object.keys(o.services)
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

  o.services = await resolveAll(o.services, { target, build, services, root: o.root }) // Resolve selected services
  Object.defineProperty(o, '__resolved', { value: true, writable: false }) // Resolution flag
  return o as ResolvedConfig
}

const writePackageJSON = (o, root = '') =>
  writeFileSync(join(root, 'package.json'), JSON.stringify(o, null, 2)) // Will not update userPkg—but this variable isn't used for the Electron process

// Ensure project can handle --desktop command
export const configureForDesktop = (outDir, root = '', defaults = {}) => {
  const userPkg = getJSON(join(root, 'package.json'))

  const pkg = {
    ...defaults,
    ...userPkg,
  }

  const resolvedOutDir = root ? relative(root, outDir) : outDir
  const defaultMainLocation = getDefaultMainLocation(resolvedOutDir)

  if (!pkg.main || normalize(pkg.main) !== normalize(defaultMainLocation)) {
    // Write back the original package.json on exit
    let __reset = false
    const reset = () => {
      if (__reset) return
      __reset = true
      writePackageJSON(pkg, root)
    }

    onCleanup(reset)

    writePackageJSON(
      {
        ...pkg,
        main: defaultMainLocation,
      },
      root
    )

    return { reset }
  }

  return {
    reset: () => {}, // No reset needed
  }
}

export const createServices = (
  services: ResolvedConfig['services'],
  opts: ServiceCreationOptions = {}
) => createAll(services, opts)

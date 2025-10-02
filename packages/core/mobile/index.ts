// Built-In Modules
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, resolve as resolvePath } from 'node:path'
import { createRequire } from 'node:module'

// Internal Imports
import * as assets from './assets.js'
import { chalk } from '../globals.js'
import { onCleanup } from '../cleanup.js'

import { CapacitorConfig, Plugin, ResolvedConfig, SupportConfiguration } from '../types.js'
import { DependencyError, PlatformError } from '../errors.js'
import { TARGET_IOS, TARGET_ANDROID, MOBILE_IOS_PLIST_PATH, MOBILE_ANDROID_MANIFEST_PATH } from '../constants.js'

// Internal Utilities
import { runCommand } from '../utils/processes.js'

// External Packages
import plist from 'plist'
import xml2js from 'xml2js'

const require = createRequire(import.meta.url)
const getRequireForRoot = root => createRequire(resolve(root, 'package.json'))

const configName = 'capacitor.config.json'

const possibleConfigNames = [configName, 'capacitor.config.js', 'capacitor.config.ts']

const getBaseConfig = ({ name, appId, outDir }) => {
  return {
    appId,
    appName: name,
    webDir: outDir,
    server: { androidScheme: 'https' },
    plugins: {},
  }
}

const isCapacitorConfig = (o: CapacitorConfig) =>
  o && typeof o === 'object' && 'name' in o && 'plugin' in o

const getCapacitorConfig = (o: Plugin) => {
  const support = o.isSupported
  return (typeof support === 'object' && 'capacitor' in support) ? support.capacitor : undefined
}

const getCapacitorPluginAccessor = (plugin: Plugin) => {
  const capacitorPlugin = getCapacitorConfig(plugin)
  if (!isCapacitorConfig(capacitorPlugin)) return null

  return {
    ref: capacitorPlugin,
    setParent: (v: boolean) => {
      const supportObj = plugin.isSupported as { capacitor?: CapacitorConfig | false }
      if (v === false) supportObj.capacitor = false // Disable plugin for mobile
    },
  }
}

const getCapacitorPluginAccessors = (plugins: ResolvedConfig['plugins']) =>
  Object.values(plugins)
    .map(o => getCapacitorPluginAccessor(o))
    .filter(x => x)

export const prebuild = ({ plugins, root }: ResolvedConfig) => {
  const require = getRequireForRoot(root)

  // Map Capacitor plugin information to their availiabity
  const accessors = getCapacitorPluginAccessors(plugins)
  accessors.forEach(({ ref, setParent }) =>
    !isInstalled(ref.plugin, require.resolve) ? setParent(false) : ''
  )
}

type MobileOptions = {
  target: typeof TARGET_IOS | typeof TARGET_ANDROID
  outDir: string
}

type ConfigOptions = {
  name: ResolvedConfig['name']
  appId: ResolvedConfig['appId']
  plugins: ResolvedConfig['plugins']
  outDir: string
  root: string
}

const getCommonersPlugins = plugins => getCapacitorPluginAccessors(plugins).map(({ ref }) => ref)

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async ({ name, appId, plugins, outDir, root }: ConfigOptions) => {
  const isUserDefined = possibleConfigNames.map(x => join(root, x)).find(x => existsSync(x))

  if (isUserDefined) {
    return {
      config: JSON.parse(readFileSync(isUserDefined, 'utf8')),
      close: () => {},
    }
  }

  const capacitorConfig = getBaseConfig({ name, appId, outDir })

  const require = getRequireForRoot(root)
  const commonersPlugins = getCommonersPlugins(plugins)
  const activePlugins = commonersPlugins.filter(ref => isInstalled(ref.plugin, require.resolve)) // NOTE: We use the presence of the associated plugin to infer use

  activePlugins.forEach(ref => (capacitorConfig.plugins[ref.name] = ref.options))

  writeFileSync(configName, JSON.stringify(capacitorConfig, null, 2))

  const manager = {
    config: capacitorConfig,
    close: () => existsSync(configName) && rmSync(configName), // Remove configuration if not specified by the user
  }

  onCleanup(manager.close)

  return manager
}

const addProjectTarget = async (target, config: ResolvedConfig, outDir: string) => {
  const { name, appId, plugins, root } = config
  const { close } = await openConfig({ name, appId, plugins, outDir, root })
  await runCommand(`npx cap add ${target} && npx cap copy ${target}`, { cwd: root })
  close()
}

const syncProject = async (config: ResolvedConfig, outDir: string) => {
  const { name, appId, target, plugins, root } = config
  const { close } = await openConfig({ name, appId, plugins, outDir, root })
  await runCommand(`npx cap sync ${target}`, { cwd: root })
  close()
}

export const init = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {
  const { plugins, root } = config

  const projectBase = resolvePath(root, target)

  await checkDepsInstalled(config)

  if (!existsSync(projectBase)) await addProjectTarget(target, config, outDir)

  const platformConfigPath = await checkPlaformConfigExists(target, root)

  // Update when creating a dynamic configuration
  const require = getRequireForRoot(root)
  const commonersPlugins = getCommonersPlugins(plugins)
  const ignored = []

  const installedPlugins = commonersPlugins.filter(({ plugin }) => {
    if (isInstalled(plugin, require.resolve)) return true
    else {
      ignored.push(plugin)
      return false
    }
  })

  // Inject the appropriate permissions into the info.plist file (iOS only)
  if (target === TARGET_IOS) {
    const xml = plist.parse(readFileSync(platformConfigPath, 'utf8')) as any
    installedPlugins.forEach(({ plist = {} }) =>
      Object.entries(plist).forEach(([key, value]) => (xml[key] = value))
    )
    writeFileSync(platformConfigPath, plist.build(xml))
  }

  // Inject the appropriate permissions into the AndroidManifest.xml file (Android only)
  else if (target === TARGET_ANDROID) {
    const xml = readFileSync(platformConfigPath, 'utf8')
    const result = await xml2js.parseStringPromise(xml)
    const androidManifest = result.manifest

    // Ensure tools namespace is declared (needed for tools: attributes)
    if (!androidManifest.$) {
      androidManifest.$ = {}
    }
    if (!androidManifest.$['xmlns:tools']) {
      androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'
    }

    // Inject permissions from plugins
    installedPlugins.forEach(({ manifest = {} }) => {
      // Handle uses-permission entries
      if (manifest['uses-permission']) {
        if (!androidManifest['uses-permission']) {
          androidManifest['uses-permission'] = []
        }

        const permissions = Array.isArray(manifest['uses-permission'])
          ? manifest['uses-permission']
          : [manifest['uses-permission']]

        permissions.forEach(permission => {
          // Check if permission already exists
          const exists = androidManifest['uses-permission'].some(existing => {
            const existingName = existing.$?.['android:name'] || existing['android:name']
            const permName = permission.$?.['android:name'] || permission['android:name']
            return existingName === permName
          })

          if (!exists) {
            // Format permission with $ wrapper for attributes
            const formattedPermission: any = { $: {} }
            Object.entries(permission).forEach(([key, value]) => {
              if (key.startsWith('android:') || key.startsWith('tools:')) {
                formattedPermission.$[key] = value
              } else {
                formattedPermission[key] = value
              }
            })
            androidManifest['uses-permission'].push(formattedPermission)
          }
        })
      }

      // Handle other manifest entries (features, etc.)
      Object.entries(manifest).forEach(([key, value]) => {
        if (key === 'uses-permission') return // Already handled above

        if (!androidManifest[key]) {
          androidManifest[key] = []
        }

        const entries = Array.isArray(value) ? value : [value]
        entries.forEach(entry => {
          // Format entry with $ wrapper for attributes
          const formattedEntry: any = { $: {} }
          Object.entries(entry).forEach(([attrKey, attrValue]) => {
            if (attrKey.startsWith('android:') || attrKey.startsWith('tools:')) {
              formattedEntry.$[attrKey] = attrValue
            } else {
              formattedEntry[attrKey] = attrValue
            }
          })
          androidManifest[key].push(formattedEntry)
        })
      })
    })

    writeFileSync(platformConfigPath, new xml2js.Builder().buildObject(result))
  }
}

const isInstalled = (pkgName, resolve = require.resolve) => {
  if (typeof pkgName !== 'string') return false

  try {
    resolve(pkgName)
    return true
  } catch (e) {
    return false
  }
}

const checkPlaformConfigExists = async (platform, root) => {
  const projectBase = resolvePath(root, platform)
  const configFilePath = join(
    projectBase,
    platform === TARGET_IOS ? MOBILE_IOS_PLIST_PATH : MOBILE_ANDROID_MANIFEST_PATH
  )
  if (!existsSync(configFilePath)) {
    throw new DependencyError(
      `@capacitor/${platform} is not installed`,
      `Platform-specific files not found at: ${configFilePath}. Run 'npx cap add ${platform}' to initialize.`
    )
  }
  return configFilePath
}

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (config: ResolvedConfig) => {

  const notInstalled = new Set()

  const require = getRequireForRoot(config.root)

  const cliInstalled = isInstalled('@capacitor/cli', require.resolve)
  if (!cliInstalled) notInstalled.add(`@capacitor/cli`)

  const coreInstalled = isInstalled('@capacitor/core', require.resolve)
  if (!coreInstalled) notInstalled.add(`@capacitor/core`)

  if (assets.has(config)) {
    const assetsInstalled = isInstalled(`@capacitor/assets`, require.resolve)
    if (!assetsInstalled) notInstalled.add(`@capacitor/assets`)
  }

  if (notInstalled.size > 0) {
    const installationCommand = `npm install -D ${[...notInstalled].join(' ')}`
    throw new DependencyError(
      'Missing required Capacitor dependencies',
      `The following packages must be installed:\n  ${installationCommand}`
    )
  }
}

export const open = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {
  const { root } = config

  await checkDepsInstalled(config)

  await syncProject(config, outDir)

  if (assets.has(config)) {
    const info = assets.create(config)
    await runCommand(`npx @capacitor/assets generate --${target}`, { cwd: root })
    assets.cleanup(info)
  }

  await runCommand(`npx cap open ${target}`, { cwd: root })
}

export const launch = async (target: typeof TARGET_IOS | typeof TARGET_ANDROID, root?: string) => {
  // Launch opens the native IDE (Xcode for iOS, Android Studio for Android)
  // The capacitor CLI command 'npx cap open' must run from the project root
  const options = root ? { cwd: root } : {}
  await runCommand(`npx cap open ${target}`, options)
}

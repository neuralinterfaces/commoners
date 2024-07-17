import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../utils/processes.js"
import { chalk, onExit } from "../globals.js"
import * as assets from './assets.js'

import { join, resolve, resolve as resolvePath } from "node:path"
import plist from 'plist'
import xml2js from 'xml2js'

import { CapacitorConfig, Plugin, ResolvedConfig, SupportConfigurationObject } from "../types.js"

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const getRequireForRoot = (root) => createRequire(resolve(root, 'package.json'))

const configName = 'capacitor.config.json'

const possibleConfigNames = [
    configName, 
    'capacitor.config.js', 
    'capacitor.config.ts'
]

const getBaseConfig = ({
    name,
    appId,
    outDir
}) => {
    return {
        appId,
        appName: name,
        webDir: outDir,
        server: { androidScheme: 'https' },
        plugins: {}
    }
}

const isCapacitorConfig = (o: CapacitorConfig) => o && typeof o === 'object' && 'name' in o && 'plugin' in o

const getCapacitorConfig = (o: Plugin) => {
    if (!(o.isSupported && typeof o.isSupported === 'object')) return null
    const mobile = o.isSupported.mobile
    if (!mobile || typeof mobile === 'boolean') return null
    return mobile.capacitor
}


const getCapacitorPluginAccessor = (plugin: Plugin) => {

    const capacitorPlugin = getCapacitorConfig(plugin)
    if (!isCapacitorConfig(capacitorPlugin)) return null

    return {
        ref: capacitorPlugin,
        setParent: (v) => {
            const supportObj = plugin.isSupported as SupportConfigurationObject
            if (v === false) supportObj.mobile = false
            else if (!supportObj.mobile) supportObj.mobile = {} // Set to evaluate to true
        }
    } 

}

const getCapacitorPluginAccessors = (plugins: ResolvedConfig["plugins"]) => Object.values(plugins).map(o => getCapacitorPluginAccessor(o)).filter(x => x)


export const prebuild = ({ plugins, root }: ResolvedConfig) => {

    const require = getRequireForRoot(root);

    // Map Capacitor plugin information to their availiabity
    const accessors = getCapacitorPluginAccessors(plugins)
    accessors.forEach(({ ref, setParent }) => (!isInstalled(ref.plugin, require.resolve)) ? setParent(false) : '')
}

type MobileOptions = {
    target: 'ios' | 'android',
    outDir: string
}

type ConfigOptions = {
    name: ResolvedConfig['name'],
    appId: ResolvedConfig['appId'],
    plugins: ResolvedConfig['plugins'],
    outDir: string,
    root: string
}

const getCommonersPlugins =  (plugins) => getCapacitorPluginAccessors(plugins).map(({ ref }) => ref)


// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async ({ 
    name, 
    appId, 
    plugins, 
    outDir,
    root
}: ConfigOptions) => {

    const isUserDefined = possibleConfigNames.map(x => join(root, x)).find(x => existsSync(x))

    if (isUserDefined) return JSON.parse(readFileSync(isUserDefined, 'utf8'))

    const capacitorConfig = getBaseConfig({ name, appId, outDir })
    
    const require = getRequireForRoot(root);
    const commonersPlugins = getCommonersPlugins(plugins)
    const activePlugins = commonersPlugins.filter(ref => isInstalled(ref.plugin, require.resolve)) // NOTE: We use the presence of the associated plugin to infer use

    activePlugins.forEach(ref => capacitorConfig.plugins[ref.name] = ref.options)

    writeFileSync(configName, JSON.stringify(capacitorConfig, null, 2))

    onExit(() => rmSync(configName)) // Remove configuration if not specified by the user

    return capacitorConfig
}

export const init = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {

    const { name, appId, plugins, root } = config

    const projectBase = resolvePath(root, target)

    const _chalk = await chalk

    await checkDepsInstalled(target, config)
    
    const capacitorConfig = await openConfig({ name, appId, plugins, outDir, root })

    if (!existsSync(projectBase)) {
        
        console.log(`\n👊 Initializing ${_chalk.bold(_chalk.cyanBright('capacitor'))}\n`)
        await runCommand(`npx cap add ${target} && npx cap copy`)
    }

    // Update when creating a dynamic configuration
    if (capacitorConfig) {

        const require = getRequireForRoot(root);
        const commonersPlugins = getCommonersPlugins(plugins)
        const ignored = []

        const installedPlugins = commonersPlugins.filter(({ plugin }) => {
            if (isInstalled(plugin, require.resolve)) return true
            else ignored.push(plugin)
        })

        // Inject the appropriate permissions into the info.plist file (iOS only)
        if (target === 'ios') {
            const plistPath = resolvePath(projectBase, 'App/App/info.plist')
            const xml = plist.parse(readFileSync(plistPath, 'utf8')) as any;
            installedPlugins.forEach(({ plist = {}}) => Object.entries(plist).forEach(([key, value]) => xml[key] = value))
            writeFileSync(plistPath, plist.build(xml));
        }


        // Inject the appropriate permissions into the AndroidManifest.xml file (Android only) (UNTESTED)
        else if (target === 'android') {
            const manifestPath = resolvePath(projectBase, 'app/src/main/AndroidManifest.xml')
            const xml = readFileSync(manifestPath, 'utf8')
            const result = await xml2js.parseStringPromise(xml)
            const androidManifest = result.manifest
            installedPlugins.forEach(({ manifest = {}}) => Object.entries(manifest).forEach(([key, value]) => androidManifest[key] = value))
            writeFileSync(manifestPath, new xml2js.Builder().buildObject(result))
        }
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

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (platform, config: ResolvedConfig) => {

    const _chalk = await chalk

    const notInstalled = new Set()

    const require = getRequireForRoot(config.root);

    const cliInstalled = isInstalled('@capacitor/cli', require.resolve)
    if (!cliInstalled) notInstalled.add(`@capacitor/cli`)

    const coreInstalled = isInstalled('@capacitor/core', require.resolve)
    if (!coreInstalled) notInstalled.add(`@capacitor/core`)

    const platformInstalled = isInstalled(`@capacitor/${platform}`, require.resolve)
    if (!platformInstalled) notInstalled.add(`@capacitor/${platform}`)

    if (assets.has(config)) {
        const assetsInstalled = isInstalled(`@capacitor/assets`, require.resolve)
        if (!assetsInstalled) notInstalled.add(`@capacitor/assets`)
    }

    if (notInstalled.size > 0) {
        const installationCommand = `npm install -D ${[...notInstalled].join(' ')}`
        console.log(_chalk.bold("\nEnsure the following packages are installed at the base of your project:"))
        console.log(installationCommand, '\n')
        // process.exit(1)
    }
}


export const open = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {
    
    const _chalk = await chalk

    await checkDepsInstalled(target, config)

    console.log(`\n👊 Running ${_chalk.bold(_chalk.cyanBright('capacitor'))}\n`)

    await openConfig({
        name: config.name,
        appId: config.appId,
        plugins: config.plugins,
        outDir,
        root: config.root
    })

    await runCommand("npx cap sync")

    if (assets.has(config)) {
        const info = assets.create(config)
        await runCommand(`npx @capacitor/assets generate --${target}`) // Generate assets
        assets.cleanup(info)
    }

    await runCommand(`npx cap open ${target}`)
}

export const launch = async (target) => {

    const _chalk = await chalk

    throw new Error(`Cannot launch for ${target} yet...`)
        
    // if (existsSync(platform))  {
    //     console.log(_chalk.red(`This project is not initialized for ${platform}`))
    //     process.exit()
    // }

    // await checkDepsInstalled(platform)
    // await openConfig(() => runCommand("npx cap sync"))
    // await runCommand(`npx cap run ${platform}`)
}
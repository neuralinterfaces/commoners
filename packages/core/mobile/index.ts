import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../utils/processes.js"
import { onExit } from "../globals.js"
import * as assets from './assets.js'

import chalk from 'chalk'

import { join, resolve as resolvePath } from "node:path"
import plist from 'plist'
import { ResolvedConfig, SupportConfigurationObject } from "../types.js"

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const getRequireForRoot = (root) => createRequire(join(root, 'package.json'))

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

const isCapacitorConfig = (o) => o && typeof o === 'object' && 'name' in o && 'plugin' in o
const getCapacitorConfig = (o) => (o.isSupported && typeof o.isSupported === 'object') ? o.isSupported?.mobile?.capacitor : null

const getCapacitorPluginAccessors = (plugins: ResolvedConfig["plugins"]) => {
    
    return Object.values(plugins).filter(o => isCapacitorConfig(getCapacitorConfig(o))).map(o => {
        const config = getCapacitorConfig(o)
        return [config, (v) => {
            const supportObj = o.isSupported as SupportConfigurationObject
            if (v === false) supportObj.mobile = false
            else if (!supportObj.mobile) supportObj.mobile = {} // Set to evaluate to true
        }]
    })
}


export const prebuild = ({ plugins, root }: ResolvedConfig) => {

    const require = getRequireForRoot(root);

    // Map Capacitor plugin information to their availiabity
    const accessors = getCapacitorPluginAccessors(plugins)
    accessors.forEach(([ref, setParent]) => (!isInstalled(ref.plugin, require.resolve)) ? setParent(false) : '')
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

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async ({ 
    name, 
    appId, 
    plugins, 
    outDir,
    root
}: ConfigOptions, callback) => {

    const isUserDefined = possibleConfigNames.map(existsSync).reduce((a: number, b: boolean) => a + (b ? 1 : 0), 0) > 0

    if (!isUserDefined) {

        const config = getBaseConfig({ name, appId, outDir })
        
        const require = getRequireForRoot(root);

        getCapacitorPluginAccessors(plugins).forEach(([ ref ]) => {
            if (isInstalled(ref.plugin, require.resolve)) config.plugins[ref.name] = ref.options ?? {} // NOTE: We use the presence of the associated plugin to infer use
        })

        writeFileSync(configName, JSON.stringify(config, null, 2))

        onExit(() => rmSync(configName)) // Remove configuration if not specified by the user
    }

    await callback()

}

export const init = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {

    checkDepsInstalled(target, config)
    
    await openConfig({
        name: config.name,
        appId: config.appId,
        plugins: config.plugins,
        outDir,
        root: config.root
    }, async () => {
        if (!existsSync(target)) {
            
            console.log(`\n👊 Initializing ${chalk.bold(chalk.cyanBright('capacitor'))}\n`)
            await runCommand(`npx cap add ${target} && npx cap copy`)

            // Inject the appropriate permissions into the info.plist file (iOS only)
            if (target === 'ios') {
                const plistPath = resolvePath('ios/App/App/info.plist')
                const xml = plist.parse(readFileSync(plistPath, 'utf8')) as any;
                xml.NSBluetoothAlwaysUsageDescription = "Uses Bluetooth to connect and interact with peripheral BLE devices."
                xml.UIBackgroundModes = ["bluetooth-central"]
                writeFileSync(plistPath, plist.build(xml));}
        }
    })
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
export const checkDepsInstalled = (platform, config: ResolvedConfig) => {

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
        console.log(chalk.bold("\nEnsure the following packages are installed at the base of your project:"))
        console.log(installationCommand, '\n')
        // process.exit(1)
    }
}


export const open = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {

    checkDepsInstalled(target, config)

    console.log(`\n👊 Running ${chalk.bold(chalk.cyanBright('capacitor'))}\n`)

    await openConfig({
        name: config.name,
        appId: config.appId,
        plugins: config.plugins,
        outDir,
        root: config.root
    }, () => runCommand("npx cap sync"))

    if (assets.has(config)) {
        const info = assets.create(config)
        await runCommand(`npx @capacitor/assets generate --${target}`) // Generate assets
        assets.cleanup(info)
    }

    await runCommand(`npx cap open ${target}`)
}

export const launch = async (target) => {

    throw new Error(`Cannot launch for ${target} yet...`)
        
    // if (existsSync(platform))  {
    //     console.log(chalk.red(`This project is not initialized for ${platform}`))
    //     process.exit()
    // }

    // await checkDepsInstalled(platform)
    // await openConfig(() => runCommand("npx cap sync"))
    // await runCommand(`npx cap run ${platform}`)
}
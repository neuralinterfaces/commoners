import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../utils/processes.js"
import { onExit } from "../globals.js"
import * as assets from './assets.js'

import chalk from 'chalk'

import { resolve } from "node:path"
import plist from 'plist'
import { ResolvedConfig, SupportConfigurationObject } from "../types.js"

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


export const prebuild = ({ plugins }: ResolvedConfig) => {
    // Map Capacitor plugin information to their availiabity
    const accessors = getCapacitorPluginAccessors(plugins)
    accessors.forEach(([ref, setParent]) => (!isInstalled(ref.plugin)) ? setParent(false) : '')
}

type MobileOptions = {
    target: string,
    outDir: string
}

type ConfigOptions = {
    name: ResolvedConfig['name'],
    appId: ResolvedConfig['appId'],
    plugins: ResolvedConfig['plugins'],
    outDir: string
}

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async ({ 
    name, 
    appId, 
    plugins, 
    outDir
}: ConfigOptions, callback) => {

    const isUserDefined = possibleConfigNames.map(existsSync).reduce((a: number, b: boolean) => a + (b ? 1 : 0), 0) > 0

    if (!isUserDefined) {

        const config = getBaseConfig({ name, appId, outDir })
        
        getCapacitorPluginAccessors(plugins).forEach(([ ref ]) => {
            if (isInstalled(ref.plugin)) {
                config.plugins[ref.name] = ref.options ?? {} // NOTE: We use the presence of the associated plugin to infer use
            }
        })

        writeFileSync(configName, JSON.stringify(config, null, 2))

        onExit(() => rmSync(configName)) // Remove configuration if not specified by the user
    }

    await callback()

}

const installForUser = async (pkgName) => {
    const specifier = pkgName // `${pkgName}${version ? `@${version}` : ''}`
    console.log(chalk.white(`— Installing ${specifier}...`))
    await runCommand(`npm install ${specifier} -D`, undefined, {log: false })
}

export const init = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {

    await checkDepsInstalled(target, config)
    
    await openConfig({
        name: config.name,
        appId: config.appId,
        plugins: config.plugins,
        outDir
    }, async () => {
        if (!existsSync(target)) {
            
            console.log(`\n👊 Initializing with ${chalk.bold(chalk.cyanBright('capacitor'))}\n`)
            await runCommand(`npx cap add ${target} && npx cap copy`)

            // Inject the appropriate permissions into the info.plist file (iOS only)
            if (target === 'ios') {
                const plistPath = resolve('ios/App/App/info.plist')
                const xml = plist.parse(readFileSync(plistPath, 'utf8')) as any;
                xml.NSBluetoothAlwaysUsageDescription = "Uses Bluetooth to connect and interact with peripheral BLE devices."
                xml.UIBackgroundModes = ["bluetooth-central"]
                writeFileSync(plistPath, plist.build(xml));}
        }
    })
}

const isInstalled = (pkgName) => typeof pkgName === 'string' ? resolve(pkgName) : false // Only accept strings

export const checkDepinstalled = async (pkgName) =>  isInstalled(pkgName) || await installForUser(pkgName)

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (platform, config: ResolvedConfig) => {
    await checkDepinstalled('@capacitor/cli')
    await checkDepinstalled('@capacitor/core')
    await checkDepinstalled(`@capacitor/${platform}`)
    if (assets.has(config)) await checkDepinstalled(`@capacitor/assets`) // NOTE: Later make these conditional
}


export const open = async ({ target, outDir }: MobileOptions, config: ResolvedConfig) => {

    await checkDepsInstalled(target, config)

    console.log(`\n👊 Opening with ${chalk.bold(chalk.cyanBright('capacitor'))}\n`)

    await openConfig({
        name: config.name,
        appId: config.appId,
        plugins: config.plugins,
        outDir
    }, () => runCommand("npx cap sync"))

    if (assets.has(config)) {
        const info = assets.create(config)
        await runCommand(`npx capacitor-assets generate --${target}`) // Generate assets
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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../utils/processes.js"
import { NAME, APPID, userPkg, outDir } from "../globals.js"
import * as assets from './assets.js'

import chalk from 'chalk'

import { resolve } from "node:path"
import plist from 'plist'
import { ResolvedConfig, SupportConfigurationObject, validMobilePlatforms } from "../types.js"

const configName = 'capacitor.config.json'

const possibleConfigNames = [
    configName, 
    'capacitor.config.js', 
    'capacitor.config.ts'
]

const getBaseConfig = () => {
    return {
        appId: APPID.replaceAll('-', ''),
        appName: NAME,
        webDir: outDir,
        server: { androidScheme: 'https' },
        plugins: {}
    }
}

const isCapacitorConfig = (o) => o && typeof o === 'object' && 'name' in o && 'plugin' in o
const getCapacitorConfig = (o) => (o.isSupported && typeof o.isSupported === 'object') ? o.isSupported?.mobile?.capacitor : null

const getCapacitorPluginAccessors = (plugins: ResolvedConfig["plugins"]) => {
    
    return plugins.filter(o => isCapacitorConfig(getCapacitorConfig(o))).map(o => {
        const config = getCapacitorConfig(o)
        return [config, (v) => {
            const supportObj = o.isSupported as SupportConfigurationObject
            if (v === false) supportObj.mobile = false
            else if (!supportObj.mobile) supportObj.mobile = {} // Set to evaluate to true
        }]
    })
}


export const prebuild = ({ plugins }) => {
    // Map Capacitor plugin information to their availiabity
    const accessors = getCapacitorPluginAccessors(plugins)
    accessors.forEach(([ref, setParent]) => (!isInstalled(ref.plugin)) ? setParent(false) : '')
}

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async ({ plugins }: ResolvedConfig, callback) => {

    const isUserDefined = possibleConfigNames.map(existsSync).reduce((a: number, b: boolean) => a + (b ? 1 : 0), 0) > 0

    if (!isUserDefined) {

        const config = getBaseConfig()
        
        getCapacitorPluginAccessors(plugins).forEach(([ ref ]) => {
            if (isInstalled(ref.plugin)) {
                config.plugins[ref.name] = ref.options ?? {} // NOTE: We use the presence of the associated plugin to infer use
            }
        })

        writeFileSync(configName, JSON.stringify(config, null, 2))
    }

    await callback()

    // Remove configuration if not specified by the user
    if (!isUserDefined) rmSync(configName)

}

const installForUser = async (pkgName, version) => {
    const specifier = `${pkgName}${version ? `@${version}` : ''}`
    console.log(chalk.yellow(`Installing ${specifier}...`))
    await runCommand(`npm install ${specifier} -D`, undefined, {log: false })
}

export const init = async (platform, config: ResolvedConfig) => {

    platform = getCorrectPlatform(platform)

    await checkDepsInstalled(platform, config)
    await openConfig(config, async () => {
        if (!existsSync(platform)) {
            await runCommand(`npx cap add ${platform} && npx cap copy`)

            // Inject the appropriate permissions into the info.plist file (iOS only)
            if (platform === 'ios') {
                const plistPath = resolve('ios/App/App/info.plist')
                const xml = plist.parse(readFileSync(plistPath, 'utf8')) as any;
                xml.NSBluetoothAlwaysUsageDescription = "Uses Bluetooth to connect and interact with peripheral BLE devices."
                xml.UIBackgroundModes = ["bluetooth-central"]
                writeFileSync(plistPath, plist.build(xml));
            }
        }
    })
}

const isInstalled = (pkgName) => typeof pkgName === 'string' ? !!(userPkg.devDependencies?.[pkgName] || userPkg.dependencies?.[pkgName]) : false // Only accept strings

export const checkDepinstalled = async (pkgName, version?: string) => isInstalled(pkgName) || await installForUser(pkgName, version)

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (platform, config: ResolvedConfig) => {
    await checkDepinstalled('@capacitor/cli')
    await checkDepinstalled('@capacitor/core')
    await checkDepinstalled(`@capacitor/${platform}`)
    if (assets.has(config)) await checkDepinstalled(`@capacitor/assets`) // NOTE: Later make these conditional
}

function getCorrectPlatform(platform) {
    return (validMobilePlatforms.includes(platform)) ? platform : platform === 'mac' ? 'ios' : 'android' 
}


export const open = async (platform, config: ResolvedConfig) => {

    platform = getCorrectPlatform(platform)

    await checkDepsInstalled(platform, config)
    await openConfig(config, () => runCommand("npx cap sync"))

    if (assets.has(config)) {
        const info = assets.create(config)
        await runCommand(`npx capacitor-assets generate --${platform}`) // Generate assets
        assets.cleanup(info)
    }

    await runCommand(`npx cap open ${platform}`)
}

export const run = async (platform) => {

    throw new Error('This command has not been configured for mobile platforms yet...')
        
    // if (existsSync(platform))  {
    //     console.log(chalk.red(`This project is not initialized for ${platform}`))
    //     process.exit()
    // }

    // await checkDepsInstalled(platform)
    // await openConfig(() => runCommand("npx cap sync"))
    // await runCommand(`npx cap run ${platform}`)
}
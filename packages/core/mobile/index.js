import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../../utilities/processes"
import { NAME, APPID, userPkg, config as resolvedConfig } from "../../../globals"
import * as assets from './assets'

import chalk from 'chalk'

import { resolve } from "node:path"
import plist from 'plist'

const configName = 'capacitor.config.json'

const possibleConfigNames = [
    configName, 
    'capacitor.config.js', 
    'capacitor.config.ts'
]

const baseConfig = {
    appId: APPID.replaceAll('-', ''),
    appName: NAME,
    webDir: 'dist',
    server: { androidScheme: 'https' },
    plugins: {}
}

const isCapacitorConfig = (o) => o && typeof o === 'object' && 'name' in o && 'plugin' in o

const getCapacitorPluginAccessors = () => resolvedConfig.plugins ? resolvedConfig.plugins.filter(o => isCapacitorConfig(o.isSupported?.mobile)).map(o => [o.isSupported?.mobile?.capacitor, (v) => {
    if (!o.isSupported.mobile) o.isSupported.mobile = {}
    o.isSupported.mobile.capacitor = v
}]) : []


export const prebuild = () => {
    // Map Capacitor plugin information to their availiabity
    const accessors = getCapacitorPluginAccessors()
    accessors.forEach(([ref, setParent]) => setParent(isInstalled(ref.plugin)))
}

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async (callback) => {

    const isUserDefined = possibleConfigNames.map(existsSync).reduce((a,b) => a+b ? 1 : 0, 0) > 0

    if (!isUserDefined) {

        const config = JSON.parse(JSON.stringify(baseConfig))
        
        getCapacitorPluginAccessors().forEach(([ ref ]) => {
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

export const init = async (platform) => {
    await checkDepsInstalled(platform)
    await openConfig(async () => {
        if (!existsSync(platform)) {
            await runCommand(`npx cap add ${platform} && npx cap copy`)

            // Inject the appropriate permissions into the info.plist file (iOS only)
            if (platform === 'ios') {
                const plistPath = resolve('ios/App/App/info.plist')
                const xml = plist.parse(readFileSync(plistPath, 'utf8'));
                xml.NSBluetoothAlwaysUsageDescription = "Uses Bluetooth to connect and interact with peripheral BLE devices."
                xml.UIBackgroundModes = ["bluetooth-central"]
                writeFileSync(plistPath, plist.build(xml));
            }
        }
    })
}

const isInstalled = (pkgName) => typeof pkgName === 'string' ? !!(userPkg.devDependencies?.[pkgName] || userPkg.dependencies?.[pkgName]) : false // Only accept strings

export const checkDepinstalled = async (pkgName, version) => isInstalled(pkgName) || await installForUser(pkgName, version)

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (platform) => {
    await checkDepinstalled('@capacitor/cli')
    await checkDepinstalled('@capacitor/core')
    await checkDepinstalled(`@capacitor/${platform}`)
    if (assets.has()) await checkDepinstalled(`@capacitor/assets`) // NOTE: Later make these conditional
}


export const open = async (platform) => {
    await checkDepsInstalled(platform)
    await openConfig(() => runCommand("npx cap sync"))

    if (assets.has()) {
        const info = assets.create()
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
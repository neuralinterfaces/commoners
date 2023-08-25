import { existsSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../../utilities/processes"
import { NAME, APPID, userPkg, config as resolvedConfig } from "../../../globals"
import * as assets from './assets'

import chalk from 'chalk'

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
    bundledWebRuntime: false,
    server: { androidScheme: 'https' },
    plugins: {}
}

const getCapacitorPlugins = () => resolvedConfig.plugins ? resolvedConfig.plugins.filter(o => o.capacitor).map(o => o.capacitor) : []

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async (callback) => {

    const isUserDefined = possibleConfigNames.map(existsSync).reduce((a,b) => a+b ? 1 : 0, 0) > 0
   
    if (!isUserDefined) {

        const config = JSON.parse(JSON.stringify(baseConfig))
        if (resolvedConfig.plugins) {
            const capacitorPlugins = getCapacitorPlugins()
            capacitorPlugins.forEach(o => config.plugins[o.name] = o.options)
        }

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
        if (!existsSync(platform)) await runCommand(`npx cap add ${platform} && npx cap copy`)
    })
}

export const checkDepinstalled = async (pkgName, version) => (!userPkg.devDependencies?.[pkgName]) ? await installForUser(pkgName, version) : true

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (platform) => {
    await checkDepinstalled('@capacitor/cli')
    await checkDepinstalled('@capacitor/core')
    await checkDepinstalled(`@capacitor/${platform}`)
    await checkDepinstalled(`@capacitor/assets`) // NOTE: Later make these conditional
    await Promise.all(getCapacitorPlugins().map(({ package: pkg }) => pkg ? checkDepinstalled(pkg?.name ?? pkg, pkg?.version) : ''))
}


export const open = async (platform) => {
    await checkDepsInstalled(platform)
    await openConfig(() => runCommand("npx cap sync"))

    const info = assets.create()
    await runCommand(`npx capacitor-assets generate --${platform}`) // Generate assets
    assets.cleanup(info)

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
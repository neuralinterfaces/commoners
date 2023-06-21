import { existsSync, rmSync, writeFileSync } from "node:fs"
import { runCommand } from "../../utilities/processes"
import { NAME, APPID, userPkg } from "../../../globals"

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
    server: { androidScheme: 'https' }
}

// Create a temporary Capacitor configuration file if the user has not defined one
export const openConfig = async (callback) => {

    const isUserDefined = possibleConfigNames.map(existsSync).reduce((a,b) => a+b ? 1 : 0, 0) > 0

    if (!isUserDefined) writeFileSync(configName, JSON.stringify(baseConfig))
    await callback()
    if (!isUserDefined) rmSync(configName)
}

const corePkg = '@capacitor/core'
const cliPkg = '@capacitor/cli'

const installForUser = async (pkgName) => {
    console.log(chalk.yellow(`Installing ${pkgName}...`))
    await runCommand(`npm install ${pkgName} -D`, undefined, {log: false })
}

export const init = async (platform) => {
    await checkDepsInstalled(platform)
    await openConfig(async () => {
        if (!existsSync(`./${platform}`)) await runCommand(`npx cap add ${platform} && npx cap copy`)
    })
}

export const checkDepinstalled = async (pkgName) => (!userPkg.devDependencies?.[pkgName]) ? await installForUser(pkgName) : true

// Install Capacitor packages as a user dependency
export const checkDepsInstalled = async (platform) => {
    await checkDepinstalled(cliPkg)
    await checkDepinstalled(corePkg)
    await checkDepinstalled(`@capacitor/${platform}`)
}

export const open = async (platform) => {
    await checkDepsInstalled(platform)
    await openConfig(() => runCommand("npx cap sync"))
    await runCommand(`npx cap open ${platform}`)
}

export const run = async (platform) => {
        
    if (existsSync(`./${platform}`))  {
        console.log(chalk.red(`This project is not initialized for ${platform}`))
        process.exit()
    }

    await checkDepsInstalled(platform)
    await openConfig(() => runCommand("npx cap sync"))
    await runCommand(`npx cap run ${platform}`)
}
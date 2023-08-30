import path from "node:path";
import { getJSON, resolveFile } from "./packages/utilities/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from "./packages/utilities/config.js";
import minimist from 'minimist';
import { yesNo } from "./packages/utilities/inquirer.js";
import { writeFileSync } from "node:fs";


export const outDir = 'dist'
export const scopedOutDir = path.join('dist', '.commoners')
export const assetOutDir = path.join(scopedOutDir, 'assets')
export const defaultMainLocation = path.join(scopedOutDir, 'main', 'index.js')

export const userPkg = getJSON('package.json')

export const cliArgs = minimist(process.argv.slice(2))
export const [ passedCommand ] = cliArgs._

const validTargets = ['desktop', 'mobile', 'web']
const validCommands = ['start', 'dev', 'build', 'launch', 'commit', 'publish']
// const validMode = ['development', 'local', 'remote']

// // Full Cascade (TO SUPPORT)
// const object = {
//     desktop: {
//         mac: true,
//         win: true,
//         linux: true
//     },
//     mobile: {
//         ios: true,
//         android: true
//     },
//     web: true
// }

// Ensure command structure is correct
if (passedCommand && !validCommands.includes(passedCommand)) throw new Error(`'${passedCommand}' is an invalid command.`)


export const validMobilePlatforms =  ['ios']

export const COMMAND = passedCommand

const isMobile = validMobilePlatforms.find(platform => cliArgs[platform])
const isDev = COMMAND === 'dev' || !COMMAND || (COMMAND === 'launch' && !isMobile && !cliArgs.desktop) // Is also the default launch command

export const command = {
    start: COMMAND === 'start',
    dev: isDev,
    build: COMMAND === 'build',
    launch: !isDev && COMMAND === 'launch',
    commit: COMMAND === 'commit',
    publish: COMMAND === 'publish'
}

// Ensure mutual exclusivity
export const target = {
    desktop: command.start || (command.build && cliArgs.desktop),
    mobile: isMobile
}

target.web = !target.desktop && !target.mobile // Default to web mode


// Ensure project can handle start command
if (target.desktop && path.normalize(userPkg.main) !== path.normalize(defaultMainLocation)) {
    const result = await yesNo('This COMMONERS project is not configured for desktop. Would you like to initialize it?')
    if (result) {
        const copy = {}
        console.log(chalk.green('Added a main entry to your package.json'))
        Object.entries(userPkg).forEach(([name, value], i) => {
            if (i === 3) copy.main = defaultMainLocation
            copy[name] = value
        })
        writeFileSync('package.json', JSON.stringify(copy, null, 2))
    } else {
        validCommands.forEach(str => command[str] = false)
        validTargets.forEach(str => target[str] = false)
        target.web = command.dev = true 
        console.log(chalk.grey('Falling back to the "dev" command'))
    }
}

export const MODE = (command.start || command.dev) ? 'development' : ( target.mobile || cliArgs.web ? 'remote' : 'local' ) // Always a development environment command

export const TARGET = Object.entries(target).find(([_, value]) => value)[0] // return the key of the first true target

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')
export const PLATFORM = validMobilePlatforms.find(str => cliArgs[str]) || getOS()  // Declared Mobile OR Implicit Desktop Patform


export const config = await getConfig()

// Add Environment Variables to the config
process.env.COMMONERS = {}
config.TARGET = process.env.TARGET = TARGET
config.MODE = process.env.MODE = MODE

export const configPath = resolveFile('commoners.config', ['.ts', '.js'])

export const NAME = userPkg.name // Specify the product name
export const APPID = `com.${NAME}.app`

export const rootDir = dirname(fileURLToPath(import.meta.url));

export const commonersPkg = getJSON(path.join(rootDir, 'package.json'))
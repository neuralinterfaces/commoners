import path from "node:path";
import { getJSON, resolveFile } from "./packages/core/utils/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { yesNo } from "./packages/core/utils/inquirer.js";
import { readFileSync, writeFileSync } from "node:fs";
import chalk from 'chalk'

import * as yaml from 'js-yaml'
import { valid, validMobilePlatforms } from "./packages/core/types.js";

export const outDir = 'dist'
export const scopedOutDir = path.join('dist', '.commoners')
export const assetOutDir = path.join(scopedOutDir, 'assets')
export const defaultMainLocation = path.join(scopedOutDir, 'main', 'index.js')

export const userPkg = getJSON('package.json')

export const cliArgs = minimist(process.argv.slice(2))
const [ passedCommand ] = cliArgs._

export const COMMAND = process.env.COMMAND = passedCommand

const isMobile = validMobilePlatforms.find(platform => cliArgs[platform])

// Ensures launch with dev command is not called...
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
const desktopTargetValue = command.start || (command.build && !!cliArgs.desktop)

export const target = {
    desktop: desktopTargetValue,
    mobile: !!isMobile,
    web: !desktopTargetValue && !isMobile // Default to web mode
}

// Ensure project can handle start command
if (target.desktop && path.normalize(userPkg.main) !== path.normalize(defaultMainLocation)) {
    const result = await yesNo('This COMMONERS project is not configured for desktop. Would you like to initialize it?')
    if (result) {
        const copy: any = {}
        console.log(chalk.green('Added a main entry to your package.json'))
        Object.entries(userPkg).forEach(([name, value], i) => {
            if (i === 3) copy.main = defaultMainLocation
            copy[name] = value
        })
        writeFileSync('package.json', JSON.stringify(copy, null, 2))
    } else {
        valid.command.forEach(str => command[str] = false)
        valid.target.forEach(str => target[str] = false)
        target.web = command.dev = true 
        console.log(chalk.grey('Falling back to the "dev" command'))
    }
}

// ----------------- GLOBAL STATE DECLARATION -----------------
export const MODE = process.env.MODE = (command.start || command.dev) ? 'development' : ( target.mobile || cliArgs.web ? 'remote' : 'local' ) as typeof valid.platform[number] // Always a development environment command

export const TARGET = process.env.TARGET = Object.entries(target).find(([_, value]) => value)[0] as typeof valid.target[number] // return the key of the first true target

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')
export const PLATFORM = (validMobilePlatforms.find(str => cliArgs[str]) || getOS()) as typeof valid.platform[number] // Declared Mobile OR Implicit Desktop Patform
// ------------------------------------------------------------

// Pre-loaded configuration objects
export const configPath = resolveFile('commoners.config', ['.ts', '.js'])

export const NAME = userPkg.name // Specify the product name
export const APPID = `com.${NAME}.app`

// Get Configuration File and Path
export const rootDir = dirname(fileURLToPath(import.meta.url));
export const templateDir = path.join(rootDir, 'template')
export const getBuildConfig = () => yaml.load(readFileSync(path.join(templateDir, 'electron-builder.yml')).toString())

// Get package file
export const commonersPkg = getJSON(path.join(rootDir, 'package.json'))

const resolveKey = (key) => {
    if (valid.mode.includes(key)) return MODE
    else if (valid.platform.includes(key)) return PLATFORM
    else if (valid.target.includes(key)) return TARGET
    return
}

export const resolvePlatformSpecificValue = (o) => {
    if (o && typeof o === 'object') {
        const resolvedKey = Object.keys(o).find(resolveKey)
        if (resolvedKey) return resolvePlatformSpecificValue(o[resolvedKey]) // Return resolved value
    } 
    
    else if (typeof o === 'function') return resolvePlatformSpecificValue(o())
    
    return o             
}
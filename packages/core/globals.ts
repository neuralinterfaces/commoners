import path from "node:path";
import { getJSON, resolveFile } from "./utils/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { readFileSync } from "node:fs";

import * as yaml from 'js-yaml'

// Types
import { valid, validMobilePlatforms, WritableElectronBuilderConfig } from "./types.js";

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

// ----------------- GLOBAL STATE DECLARATION -----------------
export const MODE = process.env.MODE = (command.start || command.dev) ? 'development' : ( target.mobile || cliArgs.web ? 'remote' : 'local' ) as typeof valid.platform[number] // Always a development environment command

export const TARGET = process.env.TARGET = Object.entries(target).find(([_, value]) => value)?.[0] as typeof valid.target[number] // return the key of the first true target

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')
export const PLATFORM = process.env.PLATFORM = (validMobilePlatforms.find(str => cliArgs[str]) || getOS()) as typeof valid.platform[number] // Declared Mobile OR Implicit Desktop Patform
// ------------------------------------------------------------

// Pre-loaded configuration objects
export const configPath = resolveFile('commoners.config', ['.ts', '.js'])

export const NAME = userPkg.name // Specify the product name
export const APPID = `com.${NAME}.app`

// Get Configuration File and Path
export const rootDir = path.resolve(dirname(fileURLToPath(import.meta.url))); // NOTE: Files referenced relative to rootDir must be transferred to the dist
export const templateDir = path.join(rootDir, 'template')
export const getBuildConfig = (): WritableElectronBuilderConfig => yaml.load(readFileSync(path.join(templateDir, 'electron-builder.yml')).toString())

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
import path from "node:path";
import { getJSON, resolveFile } from "./utils/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { readFileSync } from "node:fs";

import * as yaml from 'js-yaml'

// Types
import { valid, validMobilePlatforms, WritableElectronBuilderConfig } from "./types.js";
import chalk from "chalk";

// Environment Variables
import dotenv from 'dotenv'
dotenv.config()

export const userPkg = getJSON('package.json')

export const cliArgs = minimist(process.argv.slice(2))
const [ passedCommand ] = cliArgs._

export const outDir = cliArgs.outDir ?? 'dist'
export const scopedOutDir = path.join(outDir, '.commoners')
export const assetOutDir = path.join(scopedOutDir, 'assets')
export const defaultMainLocation = path.join(scopedOutDir, 'main.js')


export const COMMAND = process.env.COMMONERS_COMMAND = passedCommand

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')
export const PLATFORM = process.env.COMMONERS_PLATFORM = (validMobilePlatforms.find(str => cliArgs[str]) || getOS()) as typeof valid.platform[number] // Declared Mobile OR Implicit Desktop Patform

const isDesktopCommandConsistent = (platform) => {
    if (cliArgs[platform]) {
        if (PLATFORM === platform) return true
        else {
            console.log(`Cannot run a command for the ${chalk.bold(platform)} platform on ${chalk.bold(PLATFORM)}`)
            process.exit(1)
        }
    }
}


const isDesktop = cliArgs.desktop || isDesktopCommandConsistent('mac') || isDesktopCommandConsistent('windows') || isDesktopCommandConsistent('linux')
const isMobile = cliArgs.mobile || !!validMobilePlatforms.find(platform => cliArgs[platform])


// Ensures launch with dev command is not called...
const isDev = COMMAND === 'dev' || !COMMAND

export const command = {
    start: COMMAND === 'start',
    dev: isDev,
    build: COMMAND === 'build',
    launch: COMMAND === 'launch',
    share: COMMAND === 'share'
}

// Ensure mutual exclusivity
export const target = {
    desktop: isDesktop,
    mobile: !!isMobile,
    pwa: cliArgs.pwa
}

// ----------------- GLOBAL STATE DECLARATION -----------------
export const MODE = process.env.COMMONERS_MODE = (command.start || command.dev || command.share || !command) ? 'development' : ( target.desktop ? 'local' : 'remote' ) as typeof valid.platform[number] // Always a development environment command

export const TARGET = process.env.COMMONERS_TARGET = Object.entries(target).find(([_, value]) => value)?.[0] as typeof valid.target[number] // return the key of the first true target

// ------------------------------------------------------------

// Pre-loaded configuration objects
export const configPath = resolveFile('commoners.config', ['.ts', '.js'])

export const RAW_NAME = userPkg.name
export const NAME = RAW_NAME.split('-').map(str => str[0].toUpperCase() + str.slice(1)).join(' ') // Specify the product name
export const APPID = `com.${RAW_NAME}.app`

// Get Configuration File and Path
export const rootDir = path.resolve(dirname(fileURLToPath(import.meta.url))); // NOTE: Files referenced relative to rootDir must be transferred to the dist
export const templateDir = path.join(rootDir, '..', 'templates')
export const getBuildConfig = (): WritableElectronBuilderConfig => yaml.load(readFileSync(path.join(templateDir, 'electron', 'electron-builder.yml')).toString())

// Get package file
const corePkg = getJSON(path.join(rootDir, 'package.json'))
export const dependencies = corePkg.dependencies

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
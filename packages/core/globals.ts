import path from "node:path";
import { getJSON } from "./utils/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from "node:fs";

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import * as yaml from 'js-yaml'

import chalk from "chalk";

// Types
import { TargetType, WritableElectronBuilderConfig, universalTargetTypes, valid, validDesktopTargets, validMobileTargets } from "./types.js";

// Environment Variables
import dotenv from 'dotenv'
dotenv.config()

export const userPkg = getJSON('package.json')

export const defaultOutDir = 'dist'
export const getScopedOutDir = (outDir) =>  path.join(outDir, '.commoners')
export const getAssetOutDir = (outDir) =>  path.join(getScopedOutDir(outDir), 'assets')
export const getDefaultMainLocation = (outDir) =>  path.join(getScopedOutDir(outDir), 'main.js')

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

export const PLATFORM = getOS()  // Declared Mobile OR Implicit Desktop Patform

export const isDesktop = (target: TargetType) => validDesktopTargets.includes(target)
export const isMobile = (target: TargetType) => validMobileTargets.includes(target)

export const ensureTargetConsistent = (target: TargetType) => {

    if (!target) target = 'web' // Default to web target

    if (universalTargetTypes.includes(target)) return target
    if (isDesktop(target) && PLATFORM === target) return target // Desktop platforms match
    else if (isMobile(target) && (PLATFORM === 'mac' || target === 'mobile' || target === 'android')) return target // Linux and Windows can build for android

    console.log(`Cannot run a commoners command for ${chalk.bold(target)} on ${chalk.bold(PLATFORM)}`)
    process.exit(1)
}

// Pre-loaded configuration objects
export const RAW_NAME = userPkg.name
export const NAME = RAW_NAME.split('-').map(str => str[0].toUpperCase() + str.slice(1)).join(' ') // Specify the product name
export const APPID = `com.${RAW_NAME}.app`

// Get Configuration File and Path
const knownPath = 'packages/core/dist/index.js'

const __dirname = path.resolve(dirname(fileURLToPath(import.meta.url)))

// Swap resolved root directories when the library is imported (e.g. from the distributed cli)
export const rootDir = (__dirname.slice(-knownPath.length) === knownPath) ? __dirname : dirname(require.resolve('@commoners/solidarity'))

export const templateDir = path.join(rootDir, 'templates')
export const getBuildConfig = (): WritableElectronBuilderConfig => yaml.load(readFileSync(path.join(templateDir, 'electron', 'electron-builder.yml')).toString())

// Get package file
const corePkg = getJSON(path.join(rootDir, 'package.json'))
export const dependencies = corePkg.dependencies

// const resolveKey = (key) => {
//     if (valid.mode.includes(key)) return MODE
//     else if (valid.platform.includes(key)) return PLATFORM
//     else if (valid.target.includes(key)) return TARGET
//     return
// }

// export const resolvePlatformSpecificValue = (o) => {
//     if (o && typeof o === 'object') {
//         const resolvedKey = Object.keys(o).find(resolveKey)
//         if (resolvedKey) return resolvePlatformSpecificValue(o[resolvedKey]) // Return resolved value
//     } 
    
//     else if (typeof o === 'function') return resolvePlatformSpecificValue(o())
    
//     return o             
// }
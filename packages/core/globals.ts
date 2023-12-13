import { join, resolve } from "node:path";
import { getJSON } from "./utils/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, rmSync } from "node:fs";

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import * as yaml from 'js-yaml'

import chalk from "chalk";

// Types
import { TargetType, WritableElectronBuilderConfig, universalTargetTypes, validDesktopTargets, validMobileTargets } from "./types.js";

// Environment Variables
import dotenv from 'dotenv'
dotenv.config()

export const globalWorkspacePath = '.commoners'

export const electronDebugPort = 8315

export const globalTempDir = join(globalWorkspacePath, '.temp')

const callbacks = []
export const onExit = (callback) => callbacks.push(callback)

const runBeforeExitCallbacks = (code) => {
    callbacks.forEach(cb => {
        if (!cb.called) cb(code)
        cb.called = true
    })
    process.exit(code)
}

const exitEvents = ['beforeExit', 'exit', 'SIGINT']

export const initialize = (tempDir = globalTempDir) => {

    if (existsSync(tempDir)) {
        console.error(`\n👎 Only ${chalk.redBright('one')} commoners command can be run at a time in the same repo.\n`) // NOTE: Ensure the single temporary directory is not overwritten for different targets
        process.exit(1)
    }
    
    exitEvents.forEach(event => process.on(event, runBeforeExitCallbacks))

    onExit(() => cleanup(tempDir)) // Always clear the temp directory on exit
    
}

export function cleanup (tempDir = globalTempDir) {
    rmSync(tempDir, { recursive: true, force: true })
}


export const getDefaultMainLocation = (outDir) =>  {
    return join(outDir, 'main.js')
}

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

export const PLATFORM = getOS()  // Declared Mobile OR Implicit Desktop Patform

export const isDesktop = (target: TargetType) => validDesktopTargets.includes(target)
export const isMobile = (target: TargetType) => validMobileTargets.includes(target)

export const normalizeTarget = (target: TargetType) => {
    const isDesktopTarget = isDesktop(target)
    const isMobileTarget = isMobile(target)
    return isDesktopTarget ? 'desktop' : isMobileTarget ? 'mobile' : 'web'
}

export const ensureTargetConsistent = (target: TargetType, allow = []) => {

    if (allow.includes(target)) return target
    
    if (!target) target = 'web' // Default to web target

    if (target === 'mobile') target = PLATFORM === 'mac' ? 'ios' : 'android'  // Auto-detect mobile platform
    if (target === 'desktop') target = 'electron' // Auto-detect desktop platform

    // Provide a custom warning message for tauri
    if (target === 'tauri') {
        console.log(chalk.yellow(`Tauri is not yet supported.`))
        process.exit(1)
    }

    if (universalTargetTypes.includes(target)) return target
    if (isDesktop(target)) return target
    else if (isMobile(target) && (PLATFORM === 'mac' || target === 'mobile' || target === 'android')) return target // Linux and Windows can build for android

    console.log(`Cannot run a commoners command for ${chalk.bold(target)} on ${chalk.bold(PLATFORM)}`)
    process.exit(1)
}

// Get Configuration File and Path
const knownPath = 'packages/core/dist/index.js'

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)))

// Swap resolved root directories when the library is imported (e.g. from the distributed cli)
export const rootDir = (__dirname.slice(-knownPath.length) === knownPath) ? __dirname : dirname(require.resolve('@commoners/solidarity'))

export const templateDir = join(rootDir, 'templates')
export const getBuildConfig = (): WritableElectronBuilderConfig => yaml.load(readFileSync(join(templateDir, 'electron', 'electron-builder.yml')).toString())

// Get package file
const corePkg = getJSON(join(rootDir, 'package.json'))
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
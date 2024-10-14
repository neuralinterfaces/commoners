// Built-In Modules
import { join, resolve } from "node:path";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from 'node:module';

// External Packages
import * as yaml from 'js-yaml'
import dotenv from 'dotenv'
dotenv.config()

// Internal Imports
import { printFailure } from "./utils/formatting.js";
import { TargetType, WritableElectronBuilderConfig, universalTargetTypes, validDesktopTargets, validMobileTargets } from "./types.js";

// Dynamic Imports
export const chalk = import("chalk").then(m => m.default)
export const vite = import("vite")

const require = createRequire(import.meta.url);
const { version: electronVersion } = require('electron/package.json')
export { electronVersion }

export const globalWorkspacePath = '.commoners'

export const globalTempDir = join(globalWorkspacePath, '.temp')

const callbacks = []
export const onCleanup = (callback) => callbacks.push(callback)

export const cleanup = (code = 0) => {
    callbacks.forEach(cb => {
        if (!cb.called) cb(code)
        cb.called = true // Prevent double-calling
    })
}

const exitEvents = ['beforeExit', 'exit', 'SIGINT']
exitEvents.forEach(event => process.on(event, (code) => {
    cleanup(code)
    process.exit(code === 'SIGINT' ? 0 : code)
}))

export const handleTemporaryDirectories = async (tempDir = globalTempDir) => {
    
    // NOTE: Ensure that the single temporary directory is not overwritten for different targets
    if (existsSync(tempDir)) {
        await printFailure('Only one commoners command can be run at a time in the same repo.')
        process.exit(1)
    }
    
    // Always clear the temp directories on exit
    const onClose = () => {
        removeDirectory(tempDir)
        removeDirectory(`${tempDir}.services`)
    }

    onCleanup(onClose)

    return {
        close: onClose
    }
}

export const removeDirectory = (path) => rmSync(path, { recursive: true, force: true })

export const getDefaultMainLocation = (outDir) =>  join(outDir, 'main.js')

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

export const PLATFORM = getOS()  // Declared Mobile OR Implicit Desktop Patform

export const isDesktop = (target: TargetType) => validDesktopTargets.includes(target)
export const isMobile = (target: TargetType) => validMobileTargets.includes(target)

export const normalizeTarget = (target: TargetType) => {
    const isDesktopTarget = isDesktop(target)
    const isMobileTarget = isMobile(target)
    return isDesktopTarget ? 'desktop' : isMobileTarget ? 'mobile' : 'web'
}

export const ensureTargetConsistent = async (target: TargetType, allow = []) => {

    if (allow.includes(target)) return target
    
    if (!target) target = 'web' // Default to web target

    if (target === 'mobile') target = PLATFORM === 'mac' ? 'ios' : 'android'  // Auto-detect mobile platform
    if (target === 'desktop') target = 'electron' // Auto-detect desktop platform

    const _chalk = await chalk

    // Provide a custom warning message for tauri
    if (target === 'tauri') {
        console.log(_chalk.yellow(`Tauri is not yet supported.`))
        process.exit(1)
    }

    if (universalTargetTypes.includes(target)) return target
    if (isDesktop(target)) return target
    else if (isMobile(target) && (PLATFORM === 'mac' || target === 'mobile' || target === 'android')) return target // Linux and Windows can build for android

    console.log(`No commoners command for ${_chalk.bold(target)} on ${_chalk.bold(PLATFORM)}`)
    process.exit(1)
}

// Get Configuration File and Path
const knownPath = join('packages', 'core', 'dist')

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)))

// Swap resolved root directories when the library is imported (e.g. from the distributed cli)
const inKnownPath = __dirname.slice(-knownPath.length) === knownPath
export const rootDir = inKnownPath ? __dirname : dirname(require.resolve('@commoners/solidarity'))

export const templateDir = join(rootDir, 'assets')
export const getBuildConfig = (): WritableElectronBuilderConfig => yaml.load(readFileSync(join(templateDir, 'electron', 'electron-builder.yml')).toString())

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
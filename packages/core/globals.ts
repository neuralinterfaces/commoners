// Built-In Modules
import { join, resolve } from "node:path";
import { dirname } from 'node:path';
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from 'node:module';

import { removeDirectory } from './utils/files.js'
import { SpecificTargetType } from './types.js'

import { onCleanup } from './cleanup.js'
export { cleanup } from './cleanup.js'

// External Packages
import * as yaml from 'js-yaml'

// Internal Imports
import { printFailure, printSubtle } from "./utils/formatting.js";
import { TargetType, WritableElectronBuilderConfig, universalTargetTypes, validDesktopTargets, validMobileTargets } from "./types.js";

// Dynamic Imports
export const chalk = import("chalk").then(m => m.default)
export const vite = import("vite")

// Ensure __filename is available in ES Modules
const ____filename = new URL('', import.meta.url).pathname
const __filename = ____filename.startsWith('/') ? ____filename.slice(1) : ____filename // NOTE: For some reason, a slash has started to be added here...
const require = createRequire(import.meta.url);
const { version: electronVersion } = require('electron/package.json')
export { electronVersion }

export const globalWorkspacePath = '.commoners'

export const globalTempDir = join(globalWorkspacePath, '.temp')

export const handleTemporaryDirectories = async (tempDir = globalTempDir) => {
    
    // NOTE: Ensure that the single temporary directory is not overwritten for different targets
    if (existsSync(tempDir)) {
        await printFailure('An active development build was detected for this project.')
        await printSubtle('Shut down the active build and try again.')
        await printSubtle(`To reset this error, you may also delete the ${resolve(tempDir)} directory.`)
        process.exit(1)
    }
    
    let removed = false
    const onClose = () => {

        // Prevent double-calling
        if (removed) return
        removed = true

        // Remove the temporary directories
        removeDirectory(tempDir)
        removeDirectory(`${tempDir}.services`)
    }

    // Always clear the temp directories on exit
    onCleanup(onClose)

    return {
        close: onClose
    }
}

export const getDefaultMainLocation = (outDir) =>  join(outDir, 'main.cjs')

const getOS = () => process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')

export const PLATFORM = getOS()  // Declared Mobile OR Implicit Desktop Patform

export const isDesktop = (target: TargetType) => validDesktopTargets.includes(target)
export const isMobile = (target: TargetType) => validMobileTargets.includes(target)

export const getNormalizedTarget = (target: TargetType) => {
    const isDesktopTarget = isDesktop(target)
    const isMobileTarget = isMobile(target)
    return isDesktopTarget ? 'desktop' : isMobileTarget ? 'mobile' : 'web'
}

export const getSpecificTarget = (target: TargetType) => {
    if (!target) target = 'web' // Default to web target
    else if (target === 'mobile') target = PLATFORM === 'mac' ? 'ios' : 'android'  // Auto-detect mobile platform
    else if (target === 'desktop') target = 'electron' // Auto-detect desktop platform
    return target as SpecificTargetType
}
    

export const ensureTargetConsistent = async (target: TargetType, allow = []) => {

    if (allow.includes(target)) return target
    target = getSpecificTarget(target)
    
    const _chalk = await chalk

    // Provide a custom warning message for tauri
    if (target === 'tauri') {
        console.error(_chalk.yellow(`Tauri is not yet supported.`))
        process.exit(1)
    }

    if (universalTargetTypes.includes(target)) return target
    if (isDesktop(target)) return target
    else if (isMobile(target) && (PLATFORM === 'mac' || target === 'mobile' || target === 'android')) return target // Linux and Windows can build for android

    console.error(`No commoners command for ${_chalk.bold(target)} on ${_chalk.bold(PLATFORM)}`)
    process.exit(1)
}

// Get Configuration File and Path
export const rootDir = dirname(require.resolve(__filename))

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
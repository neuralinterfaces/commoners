// Built-In Modules
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { exists, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { removeDirectory } from './utils/files.js'
import { getFilename } from './utils/paths.js'
import { SpecificTargetType } from './types.js'

import { onCleanup } from './cleanup.js'
export { cleanup } from './cleanup.js'

// Error classes
import { BuildError, PlatformError } from './errors.js'

// Constants
import {
  TARGET_DESKTOP,
  TARGET_DESKTOP_ELECTRON,
  TARGET_DESKTOP_TAURI,
  TARGET_MOBILE,
  TARGET_IOS,
  TARGET_ANDROID,
  TARGET_IOS_CAPACITOR,
  TARGET_ANDROID_CAPACITOR,
  TARGET_IOS_TAURI,
  TARGET_ANDROID_TAURI,
  PLATFORM_MAC,
  DIR_ELECTRON,
} from './constants.js'

// External Packages
import * as yaml from 'js-yaml'

// Internal Imports

import {
  TargetType,
  WritableElectronBuilderConfig,
  universalTargetTypes,
  validDesktopTargets,
  validMobileTargets,
} from './types.js'

import { globalWorkspacePath } from './assets/services/paths.js'
export { globalWorkspacePath }


// Dynamic Imports
export const chalk = import('chalk').then(m => m.default)
export const vite = import('vite')

// Operating System
const getOS = () =>
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
export const PLATFORM = getOS() // Declared Mobile OR Implicit Desktop Patform

// Ensure __filename is available in ES Modules
const __filename = getFilename(import.meta.url)
const require = createRequire(import.meta.url)
const { version: electronVersion } = require('electron/package.json')
export { electronVersion }

export const globalTempDir = join(globalWorkspacePath, '.tmp')

let activeStagingDir: string
export const handleTemporaryDirectories = async (
  config,
  overwrite = false,
  options: { cleanupOnExit?: boolean } = {}
) => {

  const tempDir = config.outDir || resolve(config.root, globalTempDir)

  const { cleanupOnExit = true } = options
  const canOverwrite = overwrite && activeStagingDir === tempDir
  const runMetadataFile = join(tempDir, 'commoners.metadata.json')
  const hasTempMetadata = existsSync(runMetadataFile)
  const isOverWritten = canOverwrite && hasTempMetadata

  // NOTE: Ensure that the single temporary directory is not overwritten for different targets
  if (!canOverwrite && hasTempMetadata) {
      const metadata = JSON.parse(readFileSync(runMetadataFile, 'utf-8'))
      const { createdAt } = metadata
      const createdAtDate = new Date(createdAt)

      // In test environments, clean up stale metadata instead of throwing
      if (process.env.__COMMONERS_TESTING) {
        removeDirectory(tempDir)
      } else {
        throw new BuildError(
          `Active development build detected (${createdAtDate.toLocaleString()})`,
          `Another build is running for this project. Shut it down first or delete: ${resolve(tempDir)}`
        )
      }
  }

  // Create a temporary metadata file
  if (!existsSync(dirname(runMetadataFile))) mkdirSync(dirname(runMetadataFile), { recursive: true })
  writeFileSync(runMetadataFile, JSON.stringify({ createdAt: new Date().toISOString(), tempDir }), 'utf-8')

  let removed = false

  activeStagingDir = tempDir
  const clearTemporaryFiles = () => {
    if (removed) return // Prevent double-calling
    removed = true
    removeDirectory(tempDir) // Remove the temporary directories
  }

  // Only register cleanup on exit if cleanupOnExit is true (e.g., for dev builds)
  if (cleanupOnExit) onCleanup(clearTemporaryFiles)

  return {
    overwrite: isOverWritten,
    close: clearTemporaryFiles,
  }
}

export const getDefaultMainLocation = outDir => join(outDir, 'main.cjs')

export const isDesktop = (target: TargetType) => validDesktopTargets.includes(target)
export const isMobile = (target: TargetType) => validMobileTargets.includes(target)

/** Check if a target uses the Electron backend */
export const isElectron = (target: TargetType) => target === TARGET_DESKTOP_ELECTRON

/** Check if a target uses the Tauri backend (desktop or mobile) */
export const isTauri = (target: TargetType) =>
  target === TARGET_DESKTOP_TAURI || target === TARGET_IOS_TAURI || target === TARGET_ANDROID_TAURI

/** Check if a target uses the Capacitor backend (mobile only) */
export const isCapacitor = (target: TargetType) =>
  target === TARGET_IOS_CAPACITOR || target === TARGET_ANDROID_CAPACITOR

/** Check if a target is a Tauri mobile target */
export const isTauriMobile = (target: TargetType) =>
  target === TARGET_IOS_TAURI || target === TARGET_ANDROID_TAURI

/** Check if a target is a Capacitor mobile target */
export const isCapacitorMobile = (target: TargetType) =>
  target === TARGET_IOS_CAPACITOR || target === TARGET_ANDROID_CAPACITOR

export const getNormalizedTarget = (target: TargetType) => {
  const isDesktopTarget = isDesktop(target)
  const isMobileTarget = isMobile(target)
  return isDesktopTarget ? TARGET_DESKTOP : isMobileTarget ? TARGET_MOBILE : 'web'
}

export const getSpecificTarget = (target: TargetType) => {
  if (!target)
    target = 'web' // Default to web target
  else if (target === TARGET_MOBILE)
    target = PLATFORM === PLATFORM_MAC ? TARGET_IOS_CAPACITOR : TARGET_ANDROID_CAPACITOR
  else if (target === TARGET_IOS)
    target = TARGET_IOS_CAPACITOR // ios → ios-capacitor (default iOS backend)
  else if (target === TARGET_ANDROID)
    target = TARGET_ANDROID_CAPACITOR // android → android-capacitor (default Android backend)
  else if (target === TARGET_DESKTOP)
    target = TARGET_DESKTOP_ELECTRON // desktop → electron (default desktop backend)
  return target as SpecificTargetType
}

export const ensureTargetConsistent = async (target: TargetType, allow = []) => {
  if (allow.includes(target)) return target
  target = getSpecificTarget(target)

  if (universalTargetTypes.includes(target)) return target
  if (isDesktop(target)) return target
  else if (isMobile(target)) {
    // iOS targets (capacitor or tauri) require macOS
    if ((target === TARGET_IOS_CAPACITOR || target === TARGET_IOS_TAURI) && PLATFORM !== PLATFORM_MAC) {
      throw new PlatformError(
        `Target '${target}' requires macOS`,
        `iOS builds can only be done on macOS.`
      )
    }
    // Android targets work on all platforms; macOS can build for all
    if (PLATFORM === PLATFORM_MAC || target === TARGET_ANDROID_CAPACITOR || target === TARGET_ANDROID_TAURI)
      return target
  }

  throw new PlatformError(
    `Target '${target}' not supported on ${PLATFORM}`,
    `This platform (${PLATFORM}) cannot build for target: ${target}`
  )
}

// Get Configuration File and Path
export const rootDir = dirname(require.resolve(__filename))

export const templateDir = join(rootDir, 'assets')
export const getBuildConfig = (): WritableElectronBuilderConfig =>
  yaml.load(readFileSync(join(templateDir, DIR_ELECTRON, 'electron-builder.yml')).toString())

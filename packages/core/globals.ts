// Built-In Modules
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { removeDirectory } from './utils/files.js'
import { SpecificTargetType } from './types.js'

import { onCleanup } from './cleanup.js'
export { cleanup } from './cleanup.js'

// Error classes
import { BuildError, PlatformError } from './errors.js'

// Constants
import {
  TARGET_ELECTRON,
  TARGET_DESKTOP,
  TARGET_MOBILE,
  TARGET_IOS,
  TARGET_ANDROID,
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

// Dynamic Imports
export const chalk = import('chalk').then(m => m.default)
export const vite = import('vite')

// Operating System
const getOS = () =>
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
export const PLATFORM = getOS() // Declared Mobile OR Implicit Desktop Patform

// Ensure __filename is available in ES Modules
const ____filename = new URL('', import.meta.url).pathname
const __filename =
  ____filename.startsWith('/') && PLATFORM === 'windows' ? ____filename.slice(1) : ____filename // NOTE: For some reason, a slash has started to be added here...
const require = createRequire(import.meta.url)
const { version: electronVersion } = require('electron/package.json')
export { electronVersion }

export const globalWorkspacePath = '.commoners'

export const globalTempDir = join(globalWorkspacePath, '.temp')

let __selectedTempDir: string
export const handleTemporaryDirectories = async (tempDir = globalTempDir, overwrite = false) => {
  const canOverwrite = overwrite && __selectedTempDir === tempDir
  const hasTempDir = existsSync(tempDir)
  const isOverWritten = canOverwrite && hasTempDir

  // NOTE: Ensure that the single temporary directory is not overwritten for different targets
  if (!canOverwrite && existsSync(tempDir)) {
    throw new BuildError(
      'Active development build detected',
      `Another build is running for this project. Shut it down first or delete: ${resolve(tempDir)}`
    )
  }

  let removed = false

  __selectedTempDir = tempDir
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
    overwrite: isOverWritten,
    close: onClose,
  }
}

export const getDefaultMainLocation = outDir => join(outDir, 'main.cjs')

export const isDesktop = (target: TargetType) => validDesktopTargets.includes(target)
export const isMobile = (target: TargetType) => validMobileTargets.includes(target)

export const getNormalizedTarget = (target: TargetType) => {
  const isDesktopTarget = isDesktop(target)
  const isMobileTarget = isMobile(target)
  return isDesktopTarget ? TARGET_DESKTOP : isMobileTarget ? TARGET_MOBILE : 'web'
}

export const getSpecificTarget = (target: TargetType) => {
  if (!target)
    target = 'web' // Default to web target
  else if (target === TARGET_MOBILE)
    target = PLATFORM === PLATFORM_MAC ? TARGET_IOS : TARGET_ANDROID // Auto-detect mobile platform
  else if (target === TARGET_DESKTOP) target = TARGET_ELECTRON // Auto-detect desktop platform
  return target as SpecificTargetType
}

export const ensureTargetConsistent = async (target: TargetType, allow = []) => {
  if (allow.includes(target)) return target
  target = getSpecificTarget(target)

  // Provide a custom warning message for tauri
  if (target === 'tauri') {
    throw new PlatformError(
      'Tauri is not yet supported',
      'Tauri support is planned for a future release. Use electron or web targets instead.'
    )
  }

  if (universalTargetTypes.includes(target)) return target
  if (isDesktop(target)) return target
  else if (isMobile(target) && (PLATFORM === PLATFORM_MAC || target === TARGET_MOBILE || target === TARGET_ANDROID))
    return target // Linux and Windows can build for android

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

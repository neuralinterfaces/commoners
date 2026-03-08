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

let __selectedTempDir: string
export const handleTemporaryDirectories = async (
  config,
  overwrite = false,
  options: { cleanupOnExit?: boolean } = {}
) => {

  const tempDir = config.outDir || resolve(config.root, globalTempDir)

  const { cleanupOnExit = true } = options
  const canOverwrite = overwrite && __selectedTempDir === tempDir
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

  __selectedTempDir = tempDir
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

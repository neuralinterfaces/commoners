/**
 * ASAR integrity dependency checking
 * Validates required native modules are available
 */

import { createLogger } from '../../assets/utils/logger.js'
import { detectArchitectureMismatch } from './windows-ffi.js'

const logger = createLogger('asar-integrity')

export interface DependencyStatus {
  ffi: boolean
  rcedit: boolean
  plist: boolean
  fuses: boolean
  architectureWarning?: string
}

/**
 * Check which integrity dependencies are available
 * @param targetArch - Optional target architecture for cross-compilation mismatch detection
 */
export function checkDependencies(targetArch?: string): DependencyStatus {
  const status: DependencyStatus = {
    ffi: false,
    rcedit: false,
    plist: false,
    fuses: false,
  }

  try {
    require('@electron/fuses')
    status.fuses = true
  } catch {}

  try {
    require('ffi-napi')
    require('ref-napi')
    require('ref-struct-napi')
    status.ffi = true
  } catch {}

  try {
    require('rcedit')
    status.rcedit = true
  } catch {}

  try {
    require('plist')
    status.plist = true
  } catch {}

  const archWarning = detectArchitectureMismatch(targetArch)
  if (archWarning) {
    status.architectureWarning = archWarning
  }

  return status
}

/**
 * Validate that required dependencies for integrity are available
 */
export function validateDependenciesForIntegrity(): boolean {
  const deps = checkDependencies()

  if (!deps.fuses) {
    logger.warn('@electron/fuses not found - cannot set Electron fuses')
    return false
  }

  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  if (isWin && !deps.ffi && !deps.rcedit) {
    logger.warn('Windows: neither ffi-napi nor rcedit available')
    return false
  }

  if (isMac && !deps.plist) {
    logger.warn('macOS: plist not found')
    return false
  }

  return true
}

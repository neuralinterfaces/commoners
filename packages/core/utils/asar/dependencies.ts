/**
 * ASAR integrity dependency checking
 * Validates required native modules are available
 */

import { createLogger } from '../../assets/utils/logger.js'
import { detectArchitectureMismatch } from './windows-ffi.js'
import { createRequire } from 'node:module'

// require() for optional and runtime-resolved modules that works in both the ESM and CJS
// builds (a bare require is undefined in ESM, so these checks would silently fail there)
const requireOptional = createRequire(import.meta.url)

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
    requireOptional('@electron/fuses')
    status.fuses = true
  } catch {
    // not installed: status.fuses stays false
  }

  try {
    requireOptional('ffi-napi')
    requireOptional('ref-napi')
    requireOptional('ref-struct-napi')
    status.ffi = true
  } catch {
    // not installed: status.ffi stays false
  }

  try {
    requireOptional('rcedit')
    status.rcedit = true
  } catch {
    // not installed: status.rcedit stays false
  }

  try {
    requireOptional('plist')
    status.plist = true
  } catch {
    // not installed: status.plist stays false
  }

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

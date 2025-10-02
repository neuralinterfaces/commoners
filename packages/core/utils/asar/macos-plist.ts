/**
 * macOS plist handling for ASAR integrity
 * Writes integrity hash into Info.plist for Electron apps
 */

import { readFileSync, writeFileSync } from 'node:fs'
import plist from 'plist'
import { createLogger } from '../../assets/utils/logger.js'

const logger = createLogger('asar-integrity')

/**
 * Write ASAR integrity hash into Info.plist
 *
 * Electron expects the ElectronAsarIntegrity key in Info.plist with:
 * - Key: 'Resources/app.asar' (MUST use forward slashes)
 * - Value: { algorithm: 'SHA256', hash: '<hash>' }
 *
 * @param infoPlistPath - Absolute path to Info.plist
 * @param headerHash - SHA256 hash of ASAR header
 * @throws Error if plist cannot be read/written
 */
export function writePlistIntegrity(infoPlistPath: string, headerHash: string): void {
  try {
    const xml = readFileSync(infoPlistPath, 'utf8')
    const obj: any = plist.parse(xml) || {}

    // Initialize ElectronAsarIntegrity if it doesn't exist
    obj.ElectronAsarIntegrity = obj.ElectronAsarIntegrity || {}

    // CRITICAL: Key MUST be exactly 'Resources/app.asar' with forward slashes
    // Electron runtime expects this exact path format
    obj.ElectronAsarIntegrity['Resources/app.asar'] = {
      algorithm: 'SHA256',
      hash: headerHash,
    }

    const out = plist.build(obj)
    writeFileSync(infoPlistPath, out, 'utf8')

    logger.info(`Wrote integrity hash to Info.plist: ${headerHash}`)
  } catch (e: any) {
    logger.error('Failed to write plist integrity:', e.message)
    throw e
  }
}

/**
 * Read ASAR integrity hash from Info.plist
 *
 * @param infoPlistPath - Absolute path to Info.plist
 * @returns Hash string if found, null otherwise
 */
export function readPlistIntegrity(infoPlistPath: string): string | null {
  try {
    const xml = readFileSync(infoPlistPath, 'utf8')
    const obj: any = plist.parse(xml)

    if (!obj || !obj.ElectronAsarIntegrity) {
      return null
    }

    const integrity = obj.ElectronAsarIntegrity['Resources/app.asar']
    if (!integrity || integrity.algorithm !== 'SHA256') {
      return null
    }

    return integrity.hash || null
  } catch (e: any) {
    logger.warn('Failed to read plist integrity:', e.message)
    return null
  }
}

/**
 * Validate that a plist file has the correct structure for integrity
 *
 * @param infoPlistPath - Absolute path to Info.plist
 * @returns true if valid, false otherwise
 */
export function validatePlistIntegrity(
  infoPlistPath: string,
  expectedHash?: string
): boolean {
  try {
    const hash = readPlistIntegrity(infoPlistPath)

    if (!hash) {
      logger.warn('No integrity hash found in Info.plist')
      return false
    }

    if (expectedHash && hash !== expectedHash) {
      logger.warn(
        `[asar-integrity] Integrity hash mismatch: expected ${expectedHash}, got ${hash}`
      )
      return false
    }

    logger.info('Info.plist integrity validated')
    return true
  } catch (e: any) {
    logger.warn('Plist validation failed:', e.message)
    return false
  }
}

/**
 * Get the expected plist path for a macOS .app bundle
 *
 * @param appBundlePath - Path to .app directory
 * @returns Path to Info.plist
 */
export function getInfoPlistPath(appBundlePath: string): string {
  return `${appBundlePath}/Contents/Info.plist`
}

/**
 * Get the expected ASAR path for a macOS .app bundle
 *
 * @param appBundlePath - Path to .app directory
 * @returns Path to app.asar
 */
export function getAsarPath(appBundlePath: string): string {
  return `${appBundlePath}/Contents/Resources/app.asar`
}

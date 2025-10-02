/**
 * Windows FFI resource writing for ASAR integrity
 * Uses ffi-napi and ref-napi to write integrity data into executable resources
 */

import { basename, dirname } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { createLogger } from '../logger.js'

const logger = createLogger('asar-integrity')

/**
 * FFI kernel32 bindings (initialized on Windows)
 */
let K: any = null
let ffiAvailable = false

// Try to load FFI on Windows
if (process.platform === 'win32') {
  try {
    const ffi = require('ffi-napi')
    const ref = require('ref-napi')

    K = ffi.Library('Kernel32', {
      GetLastError: ['uint32', []],
      BeginUpdateResourceW: ['pointer', ['pointer', 'bool']],
      UpdateResourceW: ['bool', ['pointer', 'pointer', 'pointer', 'uint16', 'pointer', 'uint32']],
      EndUpdateResourceW: ['bool', ['pointer', 'bool']],
      LoadLibraryExW: ['pointer', ['pointer', 'pointer', 'uint32']],
      FindResourceExW: ['pointer', ['pointer', 'pointer', 'pointer', 'uint16']],
      SizeofResource: ['uint32', ['pointer', 'pointer']],
      LoadResource: ['pointer', ['pointer', 'pointer']],
      LockResource: ['pointer', ['pointer']],
      FreeLibrary: ['bool', ['pointer']],
    })

    ffiAvailable = true
  } catch (e: any) {
    ffiAvailable = false
    // Error will be handled by dependency validation
  }
}

/**
 * Convert string to wide string buffer for Windows API
 */
function wstr(s: string): Buffer {
  return Buffer.from(s + '\u0000', 'ucs2')
}

/**
 * Get last Windows error code
 */
function lastErr(): number {
  return K?.GetLastError() || 0
}

/**
 * Check if FFI is available for use
 */
export function isFFIAvailable(): boolean {
  return ffiAvailable && K !== null
}

/**
 * Write integrity resource using FFI (preferred method)
 * @throws Error if FFI is not available or writing fails
 */
export function writeIntegrityResourceFFI(exePath: string, payloadJson: string): void {
  if (process.platform !== 'win32' || !ffiAvailable || !K) {
    throw new Error('FFI not available for Windows resource writing')
  }

  const exeW = wstr(exePath)
  const typeW = wstr('Integrity')
  const nameW = wstr('ElectronAsar')
  const data = Buffer.from(payloadJson, 'utf8')

  const h = K.BeginUpdateResourceW(exeW, false)
  if (!h || (h.isNull && h.isNull())) {
    throw new Error(`BeginUpdateResourceW failed (err=${lastErr()})`)
  }

  let ok = true
  let err = 0

  // Try multiple language IDs for better compatibility
  const languageIds = [1033, 0, 1024] // US English, Neutral, Default

  for (const lang of languageIds) {
    const r = K.UpdateResourceW(h, typeW, nameW, lang, data, data.length)
    if (!r) {
      const currentErr = lastErr()
      logger.warn(
        `[asar-integrity] UpdateResourceW failed (lang=${lang}, err=${currentErr})`
      )
      if (ok) {
        // Only set error on first failure
        ok = false
        err = currentErr
      }
    } else {
      logger.info(
        `[asar-integrity] UpdateResourceW OK (lang=${lang}, ${data.length} bytes)`
      )
      ok = true // At least one succeeded
      break // Exit on first success
    }
  }

  const end = K.EndUpdateResourceW(h, !ok)
  if (!end) {
    const endErr = lastErr()
    throw new Error(`EndUpdateResourceW failed (err=${endErr})`)
  }

  if (!ok) {
    throw new Error(`All UpdateResourceW attempts failed (last err=${err})`)
  }
}

/**
 * Read integrity resource using FFI
 * Returns array of language-specific resources found
 */
export function readIntegrityResource(exePath: string): Array<{
  lang: number
  found: boolean
  json?: string
  size?: number
}> {
  if (process.platform !== 'win32' || !ffiAvailable || !K) {
    return []
  }

  try {
    // Validate the executable exists and is actually an executable
    if (!existsSync(exePath)) {
      logger.warn(
        `[asar-integrity] Executable not found for integrity verification: ${exePath}`
      )
      return []
    }

    const stats = statSync(exePath)
    if (stats.size === 0) {
      logger.warn(`Executable appears to be empty: ${exePath}`)
      return []
    }

    const ref = require('ref-napi')

    // More robust load flags - try them in order of preference
    const loadAttempts = [
      { flag: 0x00000002, name: 'LOAD_LIBRARY_AS_DATAFILE' },
      { flag: 0x00000020, name: 'LOAD_LIBRARY_AS_IMAGE_RESOURCE' },
      { flag: 0x00000022, name: 'LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE' },
      { flag: 0x00000000, name: 'Default (no flags)' },
    ]

    let mod = null
    let lastError = 0
    let successfulFlag = null

    for (const attempt of loadAttempts) {
      try {
        mod = K.LoadLibraryExW(wstr(exePath), ref.NULL, attempt.flag)
        lastError = lastErr()

        if (mod && !(mod.isNull && mod.isNull())) {
          successfulFlag = attempt.name
          logger.info(`LoadLibraryExW succeeded with ${attempt.name}`)
          break
        }

        logger.info(
          `[asar-integrity] LoadLibraryExW failed with ${attempt.name} (err=${lastError})`
        )
        mod = null
      } catch (e: any) {
        logger.warn(
          `[asar-integrity] Exception during LoadLibraryExW with ${attempt.name}:`,
          e.message
        )
        mod = null
      }
    }

    if (!mod) {
      // Don't throw here - this is verification, not critical path
      logger.warn(
        `[asar-integrity] All LoadLibraryExW attempts failed for ${basename(exePath)} (last err=${lastError})`
      )
      logger.warn(
        '[asar-integrity] This may indicate the executable is corrupted, locked, or has an incompatible architecture'
      )
      return []
    }

    // Read resources for all language IDs
    const typeW = wstr('Integrity')
    const nameW = wstr('ElectronAsar')
    const langs = [1033, 0, 1024]

    const out: Array<{ lang: number; found: boolean; json?: string; size?: number }> =
      []

    for (const lang of langs) {
      try {
        const hRes = K.FindResourceExW(mod, typeW, nameW, lang)
        if (!hRes || (hRes.isNull && hRes.isNull())) {
          out.push({ lang, found: false })
          continue
        }

        const size = K.SizeofResource(mod, hRes)
        const hMem = K.LoadResource(mod, hRes)
        const ptr = K.LockResource(hMem)
        let json: string | undefined

        if (ptr && !(ptr as any).isNull?.() && size > 0) {
          json = Buffer.from(ref.reinterpret(ptr, size)).toString('utf8')
        }

        out.push({ lang, found: true, json, size })
      } catch (e: any) {
        logger.warn(
          `[asar-integrity] Error reading resource for language ${lang}:`,
          e.message
        )
        out.push({ lang, found: false })
      }
    }

    try {
      K.FreeLibrary(mod)
    } catch (e: any) {
      logger.warn('[asar-integrity] Error freeing library:', e.message)
    }

    return out
  } catch (e: any) {
    logger.warn('Error reading integrity resource:', e.message)
    return []
  }
}

/**
 * Write integrity resource using rcedit (fallback method)
 * @throws Error if rcedit is not available or writing fails
 */
export async function writeIntegrityResourceRcedit(
  exePath: string,
  payloadJson: string
): Promise<void> {
  if (process.platform !== 'win32') {
    return
  }

  try {
    const rcedit = require('rcedit')

    // Use file version info as a more reliable storage method
    const existingVersionInfo = await rcedit(exePath, {}).catch(() => ({}))

    await rcedit(exePath, {
      'version-string': {
        ...existingVersionInfo,
        ElectronAsarIntegrity: payloadJson,
      },
    })

    logger.info('rcedit integrity resource written successfully')
  } catch (e: any) {
    logger.error('rcedit failed:', e.message)
    throw new Error(`rcedit failed: ${e.message}`)
  }
}

/**
 * Dependency status for Windows resource writing
 */
export interface WindowsDependencyStatus {
  ffiAvailable: boolean
  rceditAvailable: boolean
  ffiError?: string
  rceditError?: string
}

/**
 * Check which Windows dependencies are available
 */
export function checkWindowsDependencies(): WindowsDependencyStatus {
  const status: WindowsDependencyStatus = {
    ffiAvailable: false,
    rceditAvailable: false,
  }

  if (process.platform !== 'win32') {
    return status
  }

  // Check FFI dependencies
  try {
    require('ffi-napi')
    require('ref-napi')
    status.ffiAvailable = ffiAvailable
  } catch (e: any) {
    status.ffiError = e.message
  }

  // Check rcedit
  try {
    require('rcedit')
    status.rceditAvailable = true
  } catch (e: any) {
    status.rceditError = e.message
  }

  return status
}

/**
 * Main resource writing function with fallbacks and retry logic
 * @throws Error if all methods fail
 */
export async function writeIntegrityResource(
  exePath: string,
  payloadJson: string
): Promise<void> {
  if (process.platform !== 'win32') {
    return
  }

  // Ensure the exe exists and is writable
  if (!existsSync(exePath)) {
    throw new Error(`Executable not found: ${exePath}`)
  }

  // Check dependencies
  const deps = checkWindowsDependencies()
  if (!deps.ffiAvailable && !deps.rceditAvailable) {
    throw new Error(
      'Cannot write integrity resource: both FFI and rcedit dependencies are missing. ' +
        'Install with: npm install ffi-napi ref-napi rcedit'
    )
  }

  // Wait a bit to ensure the file is fully written and not locked
  await new Promise((resolve) => setTimeout(resolve, 100))

  let lastError: Error | null = null
  let ffiAttempted = false
  let rceditAttempted = false

  // Try FFI first with retry
  if (deps.ffiAvailable && ffiAvailable) {
    ffiAttempted = true
    logger.info('Attempting FFI-based integrity embedding...')

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100)) // Progressive delay
        writeIntegrityResourceFFI(exePath, payloadJson)
        logger.info(
          `[asar-integrity] ✅ FFI resource writing succeeded on attempt ${attempt + 1}`
        )
        return
      } catch (e: any) {
        lastError = e
        logger.warn(
          `[asar-integrity] FFI resource writing attempt ${attempt + 1} failed:`,
          e.message
        )
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 200)) // Wait before retry
        }
      }
    }
    logger.warn('All FFI attempts failed, trying rcedit fallback...')
  }

  // Fallback to rcedit with retry
  if (deps.rceditAvailable) {
    rceditAttempted = true
    logger.info('Attempting rcedit-based integrity embedding...')

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100)) // Progressive delay
        await writeIntegrityResourceRcedit(exePath, payloadJson)
        logger.info(
          `[asar-integrity] ✅ rcedit resource writing succeeded on attempt ${attempt + 1}`
        )
        return
      } catch (e: any) {
        lastError = e
        logger.warn(
          `[asar-integrity] rcedit attempt ${attempt + 1} failed:`,
          e.message
        )
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 200)) // Wait before retry
        }
      }
    }
  }

  // Build comprehensive error message
  const errorDetails = [
    'All resource writing methods failed:',
    ffiAttempted
      ? `- FFI method: ${ffiAttempted ? 'ATTEMPTED' : 'SKIPPED'} (${deps.ffiAvailable ? 'available' : 'unavailable'})`
      : null,
    rceditAttempted
      ? `- rcedit method: ${rceditAttempted ? 'ATTEMPTED' : 'SKIPPED'} (${deps.rceditAvailable ? 'available' : 'unavailable'})`
      : null,
    `Last error: ${lastError?.message}`,
    '',
    'This means your Electron app will NOT have ASAR integrity validation.',
    'To fix this:',
    '1. Install missing dependencies: npm install ffi-napi ref-napi rcedit',
    '2. Ensure the executable is not running during build',
    '3. Check Windows permissions allow writing to the executable',
    '4. Try running the build as administrator if permission issues persist',
  ]
    .filter(Boolean)
    .join('\n')

  throw new Error(errorDetails)
}

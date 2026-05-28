import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createLogger } from '../../assets/utils/logger.js'

const logger = createLogger('asar-debug')

// Helper functions that support both string messages and context objects
const log = (message: string, context?: any) => {
  if (typeof context === 'object' && context !== null) {
    logger.debug(message, context)
  } else {
    logger.debug(message)
  }
}

const warn = (message: string, context?: any) => {
  if (typeof context === 'object' && context !== null) {
    logger.warn(message, context)
  } else {
    logger.warn(message)
  }
}

const error = (message: string, context?: any) => {
  if (typeof context === 'object' && context !== null) {
    logger.error(message, context)
  } else {
    logger.error(message)
  }
}

interface AsarState {
  exists: boolean
  size: number
  mtime: string
  jsonHeaderHash?: string
  fullHeaderHash?: string
  jsonHeaderSize?: number
  fullHeaderSize?: number
  isValid?: boolean
  error?: string
}

interface AsarDebugContext {
  hookType?: string
  hook?: string
  product?: string
  exeForWin?: string
  jsonHash?: string
  fullHash?: string
  verifiedHash?: string
  originalJsonHash?: string
  finalJsonHash?: string
  originalFullHash?: string
  finalFullHash?: string
  jsonHashMatch?: boolean
  fullHashMatch?: boolean
  [key: string]: any
}

function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

// Read ASAR JSON header bytes (12-byte prelude + JSON)
function readJsonHeaderBytes(asarPath: string): Buffer | null {
  let fd = -1
  try {
    fd = openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null

    const len0 = pre.readUInt32LE(0)
    const headerSize = pre.readUInt32LE(4)
    const jsonLen = pre.readUInt32LE(8)

    // Validate header structure
    if (len0 !== 4 || headerSize !== 4 + jsonLen || jsonLen <= 0) return null

    const json = Buffer.allocUnsafe(jsonLen)
    if (readSync(fd, json, 0, jsonLen, 12) !== jsonLen) return null

    return json
  } catch (e) {
    return null
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

// Read FULL ASAR header (12-byte prelude + JSON)
function readFullHeaderBytes(asarPath: string): Buffer | null {
  let fd = -1
  try {
    fd = openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null

    const jsonLen = pre.readUInt32LE(8)
    if (jsonLen <= 0) return null

    const full = Buffer.allocUnsafe(12 + jsonLen)
    pre.copy(full, 0, 0, 12)
    if (readSync(fd, full, 12, jsonLen, 12) !== jsonLen) return null

    return full
  } catch (e) {
    return null
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

// Validate ASAR file structure
function validateAsarStructure(asarPath: string): { isValid: boolean; error?: string } {
  let fd = -1
  try {
    fd = openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (readSync(fd, pre, 0, 12, 0) !== 12) {
      return { isValid: false, error: 'Cannot read 12-byte prelude' }
    }

    const len0 = pre.readUInt32LE(0)
    const headerSize = pre.readUInt32LE(4)
    const jsonLen = pre.readUInt32LE(8)

    if (len0 !== 4) {
      return { isValid: false, error: `Invalid len0: expected 4, got ${len0}` }
    }

    if (headerSize !== 4 + jsonLen) {
      return {
        isValid: false,
        error: `Invalid header size: expected ${4 + jsonLen}, got ${headerSize}`,
      }
    }

    if (jsonLen <= 0 || jsonLen > 50 * 1024 * 1024) {
      // Sanity check: max 50MB header
      return { isValid: false, error: `Invalid JSON length: ${jsonLen}` }
    }

    // Try to read and parse the JSON header
    const json = Buffer.allocUnsafe(jsonLen)
    if (readSync(fd, json, 0, jsonLen, 12) !== jsonLen) {
      return { isValid: false, error: 'Cannot read JSON header' }
    }

    try {
      const jsonStr = json.toString('utf8')
      const parsed = JSON.parse(jsonStr)

      // Basic validation that this looks like an ASAR header
      if (!parsed || typeof parsed !== 'object' || !parsed.files) {
        return { isValid: false, error: "JSON header missing 'files' property" }
      }

      return { isValid: true }
    } catch (e: any) {
      return { isValid: false, error: `Invalid JSON in header: ${e.message}` }
    }
  } catch (e: any) {
    return { isValid: false, error: `File access error: ${e.message}` }
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

// Get comprehensive ASAR state
function getAsarState(asarPath: string): AsarState {
  const state: AsarState = {
    exists: false,
    size: 0,
    mtime: '',
  }

  try {
    if (!existsSync(asarPath)) {
      return state
    }

    state.exists = true
    const stats = statSync(asarPath)
    state.size = stats.size
    state.mtime = stats.mtime.toISOString()

    // Validate ASAR structure
    const validation = validateAsarStructure(asarPath)
    state.isValid = validation.isValid
    if (!validation.isValid) {
      state.error = validation.error
      return state
    }

    // Read and hash JSON header
    const jsonHeader = readJsonHeaderBytes(asarPath)
    if (jsonHeader) {
      state.jsonHeaderSize = jsonHeader.length
      state.jsonHeaderHash = sha256(jsonHeader)
    }

    // Read and hash full header
    const fullHeader = readFullHeaderBytes(asarPath)
    if (fullHeader) {
      state.fullHeaderSize = fullHeader.length
      state.fullHeaderHash = sha256(fullHeader)
    }
  } catch (e: any) {
    state.error = e.message
    state.isValid = false
  }

  return state
}

// Compare two ASAR states to detect changes
function compareAsarStates(before: AsarState, after: AsarState, context: string): void {
  const changes: string[] = []

  if (before.exists !== after.exists) {
    changes.push(`exists: ${before.exists} → ${after.exists}`)
  }

  if (before.size !== after.size) {
    changes.push(`size: ${before.size} → ${after.size}`)
  }

  if (before.mtime !== after.mtime) {
    changes.push(`mtime: ${before.mtime} → ${after.mtime}`)
  }

  if (before.jsonHeaderHash !== after.jsonHeaderHash) {
    changes.push(`jsonHash: ${before.jsonHeaderHash || 'null'} → ${after.jsonHeaderHash || 'null'}`)
  }

  if (before.fullHeaderHash !== after.fullHeaderHash) {
    changes.push(`fullHash: ${before.fullHeaderHash || 'null'} → ${after.fullHeaderHash || 'null'}`)
  }

  if (before.isValid !== after.isValid) {
    changes.push(`valid: ${before.isValid} → ${after.isValid}`)
  }

  if (changes.length > 0) {
    warn(`ASAR changed during ${context}:`, changes.join(', '))
  } else {
    log(`ASAR unchanged during ${context}`)
  }
}

// Verify hash consistency with expected values
function verifyHashConsistency(state: AsarState, context: AsarDebugContext): void {
  const issues: string[] = []

  // Check if hashes from context match current state
  if (context.jsonHash && state.jsonHeaderHash && context.jsonHash !== state.jsonHeaderHash) {
    issues.push(`JSON hash mismatch: expected ${context.jsonHash}, current ${state.jsonHeaderHash}`)
  }

  if (context.fullHash && state.fullHeaderHash && context.fullHash !== state.fullHeaderHash) {
    issues.push(`Full hash mismatch: expected ${context.fullHash}, current ${state.fullHeaderHash}`)
  }

  // Check original vs final hash comparisons from context
  if (context.originalJsonHash && context.finalJsonHash) {
    if (context.originalJsonHash !== context.finalJsonHash) {
      issues.push(`JSON header changed: ${context.originalJsonHash} → ${context.finalJsonHash}`)
    }
  }

  if (context.originalFullHash && context.finalFullHash) {
    if (context.originalFullHash !== context.finalFullHash) {
      issues.push(`Full header changed: ${context.originalFullHash} → ${context.finalFullHash}`)
    }
  }

  // Check verification results
  if (
    context.verifiedHash &&
    state.jsonHeaderHash &&
    context.verifiedHash !== state.jsonHeaderHash
  ) {
    if (context.verifiedHash !== state.fullHeaderHash) {
      issues.push(
        `Verified hash ${context.verifiedHash} matches neither JSON (${state.jsonHeaderHash}) nor full (${state.fullHeaderHash}) hash`
      )
    }
  }

  if (issues.length > 0) {
    error('Hash consistency issues detected:')
    issues.forEach(issue => error(`  - ${issue}`))
    error('This may indicate ASAR file corruption or build process issues!')
  } else if (context.jsonHash || context.fullHash || context.verifiedHash) {
    log('Hash consistency verified')
  }
}

// Global state tracking for comparison
const stateHistory = new Map<string, AsarState>()

/**
 * Log and analyze ASAR state at different points in the build process
 */
export function logAsarState(
  checkpoint: string,
  asarPath: string,
  context: AsarDebugContext = {}
): AsarState {
  log(`=== ASAR State Check: ${checkpoint} ===`)

  if (!asarPath) {
    warn('No ASAR path provided')
    return { exists: false, size: 0, mtime: '' }
  }

  const state = getAsarState(asarPath)

  // Log basic info
  log(`Path: ${asarPath}`)
  log(`Exists: ${state.exists}`)

  if (!state.exists) {
    warn('ASAR file does not exist')
    return state
  }

  log(`Size: ${state.size.toLocaleString()} bytes`)
  log(`Modified: ${state.mtime}`)
  log(`Valid: ${state.isValid}`)

  if (state.error) error(state.error)

  if (state.isValid) {
    log(`JSON Header: ${state.jsonHeaderSize} bytes, SHA256: ${state.jsonHeaderHash}`)
    log(`Full Header: ${state.fullHeaderSize} bytes, SHA256: ${state.fullHeaderHash}`)
  }

  // Log context information
  if (Object.keys(context).length > 0) log('Context:', context)

  // Compare with previous state if available
  const previousState = stateHistory.get(asarPath)
  if (previousState) {
    compareAsarStates(previousState, state, checkpoint)
  }

  // Verify hash consistency
  if (state.isValid) {
    verifyHashConsistency(state, context)
  }

  // Store current state for next comparison
  stateHistory.set(asarPath, { ...state })

  // Special validation for critical checkpoints
  if (checkpoint === 'AFTER_SUCCESSFUL_VERIFICATION' || checkpoint === 'FINAL_VERIFICATION_AFTER') {
    validateFinalIntegrity(state, context)
  }

  log(`=== End ${checkpoint} ===\n`)

  return state
}

// Special validation for final integrity state
function validateFinalIntegrity(state: AsarState, context: AsarDebugContext): void {
  log('🔍 Final Integrity Validation')

  const criticalIssues: string[] = []

  // Must have valid ASAR
  if (!state.isValid) {
    criticalIssues.push('ASAR file is invalid or corrupted')
  }

  // Must have hashes
  if (!state.jsonHeaderHash) {
    criticalIssues.push('JSON header hash missing')
  }

  if (!state.fullHeaderHash) {
    criticalIssues.push('Full header hash missing')
  }

  // Check for hash stability if we have comparison data
  if (context.jsonHashMatch === false) {
    criticalIssues.push('JSON header hash changed during build process')
  }

  if (context.fullHashMatch === false) {
    criticalIssues.push('Full header hash changed during build process')
  }

  if (criticalIssues.length > 0) {
    error('❌ CRITICAL INTEGRITY ISSUES DETECTED:')
    criticalIssues.forEach(issue => error(`  - ${issue}`))
    error('The application may fail to start with integrity validation enabled!')
  } else {
    log('Final integrity validation passed')
    log(`Stable JSON hash: ${state.jsonHeaderHash}`)
    log(`Stable full hash: ${state.fullHeaderHash}`)
  }
}

// Utility to manually verify integrity at any point
export function manualAsarIntegrityCheck(asarPath: string): boolean {
  log('🔍 Manual ASAR Integrity Check')

  const state = getAsarState(asarPath)

  if (!state.exists) {
    error('ASAR file does not exist')
    return false
  }

  if (!state.isValid) {
    error(`ASAR file is invalid: ${state.error}`)
    return false
  }

  if (!state.jsonHeaderHash || !state.fullHeaderHash) {
    error('Could not compute ASAR hashes')
    return false
  }

  log('ASAR file is valid and hashes computed successfully')
  log(`JSON Header Hash: ${state.jsonHeaderHash}`)
  log(`Full Header Hash: ${state.fullHeaderHash}`)

  return true
}

// Clear state history (useful for testing)
export function clearAsarStateHistory(): void {
  stateHistory.clear()
  log('ASAR state history cleared')
}

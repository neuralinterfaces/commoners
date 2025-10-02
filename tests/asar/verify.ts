/**
 * Cross-platform ASAR integrity verification for E2E tests
 * Verifies that ASAR integrity protection is properly configured
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export interface VerificationResult {
  success: boolean
  errors: string[]
  warnings: string[]
  checks: {
    asarExists: boolean
    metadataExists: boolean
    hashMatches: boolean
    fuseDetected: boolean
  }
  details: {
    asarPath?: string
    hash?: string
    embeddedHash?: string
    hashMode?: 'json' | 'full'
  }
}

/**
 * Compute SHA-256 hash of data
 */
function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Read the JSON header (first 16 bytes) from ASAR
 */
function readJsonHeaderBytes(asarPath: string): Buffer | null {
  try {
    const fd = require('fs').openSync(asarPath, 'r')
    const buffer = Buffer.alloc(16)
    require('fs').readSync(fd, buffer, 0, 16, 0)
    require('fs').closeSync(fd)
    return buffer
  } catch (e) {
    return null
  }
}

/**
 * Read the full header from ASAR
 */
function readFullHeaderBytes(asarPath: string): Buffer | null {
  try {
    const fd = require('fs').openSync(asarPath, 'r')

    // Read first 8 bytes to get header sizes
    const sizeBuffer = Buffer.alloc(8)
    require('fs').readSync(fd, sizeBuffer, 0, 8, 0)

    // Parse sizes (little-endian)
    const size1 = sizeBuffer.readUInt32LE(0)
    const size2 = sizeBuffer.readUInt32LE(4)
    const headerSize = size1 + size2 + 8

    // Read entire header
    const header = Buffer.alloc(headerSize)
    require('fs').readSync(fd, header, 0, headerSize, 0)
    require('fs').closeSync(fd)

    return header
  } catch (e) {
    return null
  }
}

/**
 * Verify ASAR integrity for macOS .app bundle
 */
function verifyMacOS(appPath: string): VerificationResult {
  const result: VerificationResult = {
    success: false,
    errors: [],
    warnings: [],
    checks: {
      asarExists: false,
      metadataExists: false,
      hashMatches: false,
      fuseDetected: false,
    },
    details: {},
  }

  // Check ASAR file
  const asarPath = join(appPath, 'Contents', 'Resources', 'app.asar')
  result.details.asarPath = asarPath

  if (!existsSync(asarPath)) {
    result.errors.push(`ASAR file not found: ${asarPath}`)
    return result
  }
  result.checks.asarExists = true

  // Check Info.plist
  const plistPath = join(appPath, 'Contents', 'Info.plist')
  if (!existsSync(plistPath)) {
    result.errors.push(`Info.plist not found: ${plistPath}`)
    return result
  }

  // Extract hash from Info.plist
  try {
    const plistXml = execSync(`plutil -convert xml1 -o - "${plistPath}"`, { encoding: 'utf-8' })

    if (!plistXml.includes('ElectronAsarIntegrity')) {
      result.errors.push('ElectronAsarIntegrity not found in Info.plist')
      return result
    }
    result.checks.metadataExists = true

    // Extract hash value
    const hashMatch = plistXml.match(/<key>hash<\/key>\s*<string>([a-f0-9]+)<\/string>/)
    if (!hashMatch) {
      result.errors.push('Could not extract hash value from Info.plist')
      return result
    }

    const embeddedHash = hashMatch[1]
    result.details.embeddedHash = embeddedHash

    // Compute hash - try JSON header first
    const jsonHeader = readJsonHeaderBytes(asarPath)
    if (jsonHeader) {
      const jsonHash = sha256(jsonHeader)
      if (jsonHash === embeddedHash) {
        result.checks.hashMatches = true
        result.details.hash = jsonHash
        result.details.hashMode = 'json'
      } else {
        // Try full header
        const fullHeader = readFullHeaderBytes(asarPath)
        if (fullHeader) {
          const fullHash = sha256(fullHeader)
          if (fullHash === embeddedHash) {
            result.checks.hashMatches = true
            result.details.hash = fullHash
            result.details.hashMode = 'full'
          } else {
            result.errors.push(
              `Hash mismatch: embedded=${embeddedHash}, json=${jsonHash}, full=${fullHash}`
            )
          }
        }
      }
    }

    // Check for fuse sentinel in executable
    const executableName = appPath.split('/').pop()?.replace('.app', '') || 'Electron'
    const executablePath = join(appPath, 'Contents', 'MacOS', executableName)

    if (existsSync(executablePath)) {
      try {
        const hexdump = execSync(`hexdump -C "${executablePath}" | head -n 100000`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        })

        if (hexdump.includes('fuses') || hexdump.includes('sentinel')) {
          result.checks.fuseDetected = true
        } else {
          result.warnings.push('Fuse sentinel not detected in executable')
        }
      } catch (e) {
        result.warnings.push('Could not check for fuse sentinel')
      }
    }
  } catch (e: any) {
    result.errors.push(`Verification failed: ${e.message}`)
  }

  // Overall success check
  result.success =
    result.checks.asarExists &&
    result.checks.metadataExists &&
    result.checks.hashMatches

  return result
}

/**
 * Verify ASAR integrity for Windows .exe
 */
function verifyWindows(exePath: string): VerificationResult {
  const result: VerificationResult = {
    success: false,
    errors: [],
    warnings: [],
    checks: {
      asarExists: false,
      metadataExists: false,
      hashMatches: false,
      fuseDetected: false,
    },
    details: {},
  }

  result.warnings.push(
    'Windows verification requires FFI or rcedit - not fully implemented in tests'
  )

  // For Windows, we'd need to check version resources, which requires native tools
  // This is a placeholder for cross-platform CI compatibility

  return result
}

/**
 * Verify ASAR integrity for a built application
 * @param appPath Path to .app (macOS) or .exe (Windows)
 */
export function verifyAsarIntegrity(appPath: string): VerificationResult {
  if (!existsSync(appPath)) {
    return {
      success: false,
      errors: [`Application not found: ${appPath}`],
      warnings: [],
      checks: {
        asarExists: false,
        metadataExists: false,
        hashMatches: false,
        fuseDetected: false,
      },
      details: {},
    }
  }

  if (appPath.endsWith('.app')) {
    return verifyMacOS(appPath)
  } else if (appPath.endsWith('.exe')) {
    return verifyWindows(appPath)
  } else {
    return {
      success: false,
      errors: [`Unsupported application format: ${appPath}`],
      warnings: [],
      checks: {
        asarExists: false,
        metadataExists: false,
        hashMatches: false,
        fuseDetected: false,
      },
      details: {},
    }
  }
}

/**
 * Pretty print verification result
 */
export function printVerificationResult(result: VerificationResult): void {
  console.log('\n=== ASAR Integrity Verification ===')

  console.log('\nChecks:')
  console.log(`  ASAR exists: ${result.checks.asarExists ? '✅' : '❌'}`)
  console.log(`  Metadata exists: ${result.checks.metadataExists ? '✅' : '❌'}`)
  console.log(`  Hash matches: ${result.checks.hashMatches ? '✅' : '❌'}`)
  console.log(`  Fuse detected: ${result.checks.fuseDetected ? '✅' : '⚠️'}`)

  if (Object.keys(result.details).length > 0) {
    console.log('\nDetails:')
    for (const [key, value] of Object.entries(result.details)) {
      if (value) console.log(`  ${key}: ${value}`)
    }
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:')
    result.warnings.forEach(w => console.log(`  ⚠️  ${w}`))
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:')
    result.errors.forEach(e => console.log(`  ❌ ${e}`))
  }

  console.log(`\nResult: ${result.success ? '✅ PASS' : '❌ FAIL'}`)
  console.log('====================================\n')
}

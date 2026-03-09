/**
 * ASAR hash computation utilities
 * Extracted from security.ts for better modularity
 */

import { createHash } from 'node:crypto'

/**
 * Compute SHA256 hash of a buffer
 */
export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Read ASAR JSON header bytes.
 * ASAR uses a 12-byte prelude: len0 (4), headerSize (4), jsonLen (4).
 * Validates that len0 === 4 and headerSize === 4 + jsonLen.
 * Returns the JSON header bytes (without prelude), or null on failure.
 */
export function readJsonHeaderBytes(asarPath: string): Buffer | null {
  const fs = require('node:fs')
  let fd = -1
  try {
    fd = fs.openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (fs.readSync(fd, pre, 0, 12, 0) !== 12) return null

    const len0 = pre.readUInt32LE(0)
    const headerSize = pre.readUInt32LE(4)
    const jsonLen = pre.readUInt32LE(8)

    // Validate header structure
    if (len0 !== 4 || headerSize !== 4 + jsonLen || jsonLen <= 0) return null

    const json = Buffer.allocUnsafe(jsonLen)
    if (fs.readSync(fd, json, 0, jsonLen, 12) !== jsonLen) return null

    return json
  } catch {
    return null
  } finally {
    if (fd >= 0) {
      try { fs.closeSync(fd) } catch {}
    }
  }
}

/**
 * Read full ASAR header (12-byte prelude + JSON).
 * Returns the complete header buffer, or null on failure.
 */
export function readFullHeaderBytes(asarPath: string): Buffer | null {
  const fs = require('node:fs')
  let fd = -1
  try {
    fd = fs.openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (fs.readSync(fd, pre, 0, 12, 0) !== 12) return null

    const jsonLen = pre.readUInt32LE(8)
    if (jsonLen <= 0) return null

    const full = Buffer.allocUnsafe(12 + jsonLen)
    pre.copy(full, 0, 0, 12)
    if (fs.readSync(fd, full, 12, jsonLen, 12) !== jsonLen) return null

    return full
  } catch {
    return null
  } finally {
    if (fd >= 0) {
      try { fs.closeSync(fd) } catch {}
    }
  }
}

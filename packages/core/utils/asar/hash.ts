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
 * Read ASAR JSON header bytes (first 16 bytes)
 */
export function readJsonHeaderBytes(asarPath: string): Buffer | null {
  const fs = require('node:fs')
  try {
    const fd = fs.openSync(asarPath, 'r')
    try {
      const buf = Buffer.alloc(16)
      fs.readSync(fd, buf, 0, 16, 0)
      return buf
    } finally {
      fs.closeSync(fd)
    }
  } catch (err) {
    return null
  }
}

/**
 * Read full ASAR header including size info
 */
export function readFullHeaderBytes(asarPath: string): Buffer | null {
  const fs = require('node:fs')
  try {
    const fd = fs.openSync(asarPath, 'r')
    try {
      const sizeBuf = Buffer.alloc(8)
      fs.readSync(fd, sizeBuf, 0, 8, 0)

      const sizePickle = sizeBuf.readUInt32LE(0)
      const sizeHeader = sizeBuf.readUInt32LE(4)

      const totalSize = 8 + sizePickle + sizeHeader
      const fullBuf = Buffer.alloc(totalSize)
      fs.readSync(fd, fullBuf, 0, totalSize, 0)

      return fullBuf
    } finally {
      fs.closeSync(fd)
    }
  } catch (err) {
    return null
  }
}

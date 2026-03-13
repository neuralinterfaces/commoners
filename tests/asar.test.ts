import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

import { sha256, readJsonHeaderBytes, readFullHeaderBytes } from '../packages/core/utils/asar/hash'

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

/**
 * Build a synthetic ASAR file with the standard 12-byte prelude + JSON header + body.
 * ASAR format: len0 (4 LE) + headerSize (4 LE) + jsonLen (4 LE) + jsonBytes + bodyBytes
 * len0 = 4, headerSize = 4 + jsonLen
 */
function buildSyntheticAsar(jsonObj: object, bodyContent = 'file-data'): Buffer {
  const jsonStr = JSON.stringify(jsonObj)
  const jsonBuf = Buffer.from(jsonStr, 'utf8')
  const bodyBuf = Buffer.from(bodyContent, 'utf8')
  const jsonLen = jsonBuf.length

  const prelude = Buffer.alloc(12)
  prelude.writeUInt32LE(4, 0) // len0 = 4
  prelude.writeUInt32LE(4 + jsonLen, 4) // headerSize = 4 + jsonLen
  prelude.writeUInt32LE(jsonLen, 8) // jsonLen

  return Buffer.concat([prelude, jsonBuf, bodyBuf])
}

let tmpDir: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'asar-test-'))
})

afterAll(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

// ────────────────────────────────────────────────────────
// 1. SHA-256 utility
// ────────────────────────────────────────────────────────

describe('sha256', () => {
  test('produces known hash for "hello world"', () => {
    expect(sha256(Buffer.from('hello world'))).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
  })

  test('empty buffer produces known hash', () => {
    expect(sha256(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
})

// ────────────────────────────────────────────────────────
// 2. readJsonHeaderBytes — parses 12-byte prelude correctly
// ────────────────────────────────────────────────────────

describe('readJsonHeaderBytes', () => {
  test('returns JSON bytes from a valid synthetic ASAR', () => {
    const header = { files: { 'index.html': { offset: '0', size: 9 } } }
    const asar = buildSyntheticAsar(header)
    const asarPath = join(tmpDir, 'valid.asar')
    writeFileSync(asarPath, asar)

    const result = readJsonHeaderBytes(asarPath)
    expect(result).not.toBeNull()
    expect(JSON.parse(result!.toString('utf8'))).toEqual(header)
  })

  test('returned bytes do NOT include the 12-byte prelude', () => {
    const header = { files: {} }
    const asar = buildSyntheticAsar(header)
    const asarPath = join(tmpDir, 'no-prelude.asar')
    writeFileSync(asarPath, asar)

    const result = readJsonHeaderBytes(asarPath)
    expect(result).not.toBeNull()
    // The result should be shorter than the full file (which includes 12-byte prelude + body)
    expect(result!.length).toBeLessThan(asar.length)
    // And it should equal exactly the JSON string length
    const jsonStr = JSON.stringify(header)
    expect(result!.length).toBe(Buffer.byteLength(jsonStr, 'utf8'))
  })

  test('returns null for truncated file (< 12 bytes)', () => {
    const asarPath = join(tmpDir, 'truncated.asar')
    writeFileSync(asarPath, Buffer.alloc(8))
    expect(readJsonHeaderBytes(asarPath)).toBeNull()
  })

  test('returns null when len0 !== 4', () => {
    const buf = Buffer.alloc(20)
    buf.writeUInt32LE(5, 0) // len0 = 5 (invalid)
    buf.writeUInt32LE(8, 4) // headerSize
    buf.writeUInt32LE(4, 8) // jsonLen
    buf.write('{}  ', 12) // 4 bytes of json
    const asarPath = join(tmpDir, 'bad-len0.asar')
    writeFileSync(asarPath, buf)
    expect(readJsonHeaderBytes(asarPath)).toBeNull()
  })

  test('returns null when headerSize !== 4 + jsonLen', () => {
    const buf = Buffer.alloc(20)
    buf.writeUInt32LE(4, 0) // len0 = 4
    buf.writeUInt32LE(99, 4) // headerSize = 99 (wrong, should be 4 + jsonLen)
    buf.writeUInt32LE(4, 8) // jsonLen = 4
    buf.write('{}  ', 12)
    const asarPath = join(tmpDir, 'bad-headersize.asar')
    writeFileSync(asarPath, buf)
    expect(readJsonHeaderBytes(asarPath)).toBeNull()
  })

  test('returns null for nonexistent file', () => {
    expect(readJsonHeaderBytes(join(tmpDir, 'nonexistent.asar'))).toBeNull()
  })
})

// ────────────────────────────────────────────────────────
// 3. readFullHeaderBytes — returns prelude + JSON
// ────────────────────────────────────────────────────────

describe('readFullHeaderBytes', () => {
  test('returns 12-byte prelude + JSON for a valid ASAR', () => {
    const header = { files: { 'app.js': { offset: '0', size: 42 } } }
    const asar = buildSyntheticAsar(header)
    const asarPath = join(tmpDir, 'full-valid.asar')
    writeFileSync(asarPath, asar)

    const result = readFullHeaderBytes(asarPath)
    expect(result).not.toBeNull()
    const jsonLen = Buffer.byteLength(JSON.stringify(header), 'utf8')
    expect(result!.length).toBe(12 + jsonLen)
  })

  test('first 12 bytes match the prelude', () => {
    const header = { files: {} }
    const asar = buildSyntheticAsar(header)
    const asarPath = join(tmpDir, 'full-prelude.asar')
    writeFileSync(asarPath, asar)

    const result = readFullHeaderBytes(asarPath)
    expect(result).not.toBeNull()
    // First 12 bytes should be identical to the ASAR file's first 12 bytes
    expect(result!.subarray(0, 12).equals(asar.subarray(0, 12))).toBe(true)
  })

  test('returns null for truncated file', () => {
    const asarPath = join(tmpDir, 'full-trunc.asar')
    writeFileSync(asarPath, Buffer.alloc(6))
    expect(readFullHeaderBytes(asarPath)).toBeNull()
  })
})

// ────────────────────────────────────────────────────────
// 4. Hash consistency — verify.ts and hash.ts produce same result
// ────────────────────────────────────────────────────────

describe('Hash consistency between hash.ts and verify.ts', () => {
  test('JSON header hash matches between production and test implementations', () => {
    const header = {
      files: {
        'index.html': { offset: '0', size: 1024 },
        'main.js': { offset: '1024', size: 2048 },
      },
    }
    const asar = buildSyntheticAsar(header)
    const asarPath = join(tmpDir, 'consistency.asar')
    writeFileSync(asarPath, asar)

    // Production code (hash.ts)
    const productionBytes = readJsonHeaderBytes(asarPath)
    expect(productionBytes).not.toBeNull()
    const productionHash = sha256(productionBytes!)

    // Manual computation for comparison
    const jsonStr = JSON.stringify(header)
    const manualHash = createHash('sha256').update(Buffer.from(jsonStr, 'utf8')).digest('hex')

    expect(productionHash).toBe(manualHash)
  })

  test('hash of JSON bytes differs from hash of first 16 bytes (old bug)', () => {
    // This test verifies we don't regress to the old "read first 16 bytes" behavior
    const header = { files: { 'a.txt': { offset: '0', size: 5 } } }
    const asar = buildSyntheticAsar(header)
    const asarPath = join(tmpDir, 'not-16-bytes.asar')
    writeFileSync(asarPath, asar)

    const correctBytes = readJsonHeaderBytes(asarPath)
    expect(correctBytes).not.toBeNull()
    const correctHash = sha256(correctBytes!)

    // Old buggy approach: hash first 16 bytes
    const buggyHash = createHash('sha256').update(asar.subarray(0, 16)).digest('hex')

    // These should differ — the correct hash covers the actual JSON content,
    // not the first 16 bytes (which include the prelude)
    expect(correctHash).not.toBe(buggyHash)
  })
})

// ────────────────────────────────────────────────────────
// 5. Plist round-trip (macOS only)
// ────────────────────────────────────────────────────────

// Check plist availability synchronously at collection time
// plist is installed in the core package, not at the monorepo root
let plistAvailable = false

let buildPlist: (obj: object) => string = () => ''
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRequire } = require('node:module')
  const coreRequire = createRequire(join(__dirname, '..', 'packages', 'core', 'package.json'))
  const plistModule = coreRequire('plist')
  buildPlist = plistModule.build
  plistAvailable = true
} catch {
  // plist not available — tests will be skipped
}

// ────────────────────────────────────────────────────────
// 5a. macOS ad-hoc signing integration (macOS only)
// ────────────────────────────────────────────────────────

describe.skipIf(process.platform !== 'darwin' || !plistAvailable)(
  'macOS ad-hoc signing preserves plist integrity',
  () => {
    test('codesign --sign - does not modify Info.plist hash', async () => {
      const { mkdirSync, writeFileSync: writeFS, readFileSync: readFS, chmodSync } = await import(
        'node:fs'
      )
      const { execSync } = await import('node:child_process')
      const {
        writePlistIntegrity,
        readPlistIntegrity,
      } = await import('../packages/core/utils/asar/macos-plist')

      // 1. Create a synthetic .app bundle structure
      const appDir = join(tmpDir, 'Test.app')
      const contentsDir = join(appDir, 'Contents')
      const macosDir = join(contentsDir, 'MacOS')
      const resourcesDir = join(contentsDir, 'Resources')

      mkdirSync(macosDir, { recursive: true })
      mkdirSync(resourcesDir, { recursive: true })

      // 2. Create a synthetic ASAR file
      const header = { files: { 'index.html': { offset: '0', size: 42 } } }
      const asar = buildSyntheticAsar(header)
      const asarPath = join(resourcesDir, 'app.asar')
      writeFS(asarPath, asar)

      // 3. Create a minimal executable (shell script as placeholder)
      const execPath = join(macosDir, 'Test')
      writeFS(execPath, '#!/bin/bash\nexit 0\n')
      chmodSync(execPath, 0o755)

      // 4. Write a minimal Info.plist
      const plistPath = join(contentsDir, 'Info.plist')
      const minimalPlist = buildPlist({
        CFBundleIdentifier: 'com.test.adhoc',
        CFBundleName: 'Test',
        CFBundleExecutable: 'Test',
        CFBundlePackageType: 'APPL',
      })
      writeFS(plistPath, minimalPlist, 'utf8')

      // 5. Compute hash and embed via writePlistIntegrity
      const jsonHeaderBytes = readJsonHeaderBytes(asarPath)
      expect(jsonHeaderBytes).not.toBeNull()
      const asarHash = sha256(jsonHeaderBytes!)
      writePlistIntegrity(plistPath, asarHash)

      // Verify hash was written
      const preSignHash = readPlistIntegrity(plistPath)
      expect(preSignHash).toBe(asarHash)

      // 6. Run codesign --sign - (ad-hoc signing)
      execSync(`codesign --sign - --force --deep "${appDir}"`, {
        encoding: 'utf8',
        timeout: 30000,
      })

      // 7. Read back hash from Info.plist — should still match
      const postSignHash = readPlistIntegrity(plistPath)
      expect(postSignHash).toBe(asarHash)

      // Also verify against the actual ASAR file
      const recomputedBytes = readJsonHeaderBytes(asarPath)
      expect(recomputedBytes).not.toBeNull()
      const recomputedHash = sha256(recomputedBytes!)
      expect(postSignHash).toBe(recomputedHash)
    })
  }
)

// ────────────────────────────────────────────────────────
// 5b. Plist round-trip (macOS only)
// ────────────────────────────────────────────────────────

describe.skipIf(!plistAvailable)('Plist round-trip', () => {
  test('writePlistIntegrity + readPlistIntegrity round-trips correctly', async () => {
    const { writePlistIntegrity, readPlistIntegrity } = await import(
      '../packages/core/utils/asar/macos-plist'
    )

    const minimalPlist = buildPlist({
      CFBundleIdentifier: 'com.test.app',
      CFBundleName: 'TestApp',
    })
    const plistPath = join(tmpDir, 'Info.plist')
    writeFileSync(plistPath, minimalPlist, 'utf8')

    const testHash = 'abc123def456789012345678901234567890123456789012345678901234abcd'
    writePlistIntegrity(plistPath, testHash)

    const readBack = readPlistIntegrity(plistPath)
    expect(readBack).toBe(testHash)
  })

  test('readPlistIntegrity returns null for plist without integrity key', async () => {
    const { readPlistIntegrity } = await import('../packages/core/utils/asar/macos-plist')

    const plainPlist = buildPlist({ CFBundleName: 'Plain' })
    const plistPath = join(tmpDir, 'Plain.plist')
    writeFileSync(plistPath, plainPlist, 'utf8')

    expect(readPlistIntegrity(plistPath)).toBeNull()
  })

  test('validatePlistIntegrity rejects mismatched hash', async () => {
    const { writePlistIntegrity, validatePlistIntegrity } = await import(
      '../packages/core/utils/asar/macos-plist'
    )

    const plistContent = buildPlist({ CFBundleName: 'Mismatch' })
    const plistPath = join(tmpDir, 'Mismatch.plist')
    writeFileSync(plistPath, plistContent, 'utf8')

    writePlistIntegrity(plistPath, 'aaaa'.repeat(16))
    expect(validatePlistIntegrity(plistPath, 'bbbb'.repeat(16))).toBe(false)
  })

  test('validatePlistIntegrity accepts matching hash', async () => {
    const { writePlistIntegrity, validatePlistIntegrity } = await import(
      '../packages/core/utils/asar/macos-plist'
    )

    const plistContent = buildPlist({ CFBundleName: 'Match' })
    const plistPath = join(tmpDir, 'Match.plist')
    writeFileSync(plistPath, plistContent, 'utf8')

    const hash = 'cccc'.repeat(16)
    writePlistIntegrity(plistPath, hash)
    expect(validatePlistIntegrity(plistPath, hash)).toBe(true)
  })
})

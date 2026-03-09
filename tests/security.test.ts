import { describe, test, expect } from 'vitest'
import { createHash } from 'node:crypto'

// ────────────────────────────────────────────────────────
// 1. IPC Channel Allowlisting
// ────────────────────────────────────────────────────────

// Mirror the preload logic so we can test it without Electron
const ALLOWED_CHANNEL_PREFIXES = ['commoners:', 'services:', 'plugins:']

function isAllowedChannel(channel: string): boolean {
  return ALLOWED_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix))
}

describe('IPC Channel Allowlisting', () => {
  test('Allows commoners: prefixed channels', () => {
    expect(isAllowedChannel('commoners:quit')).toBe(true)
    expect(isAllowedChannel('commoners:services')).toBe(true)
    expect(isAllowedChannel('commoners:close')).toBe(true)
    expect(isAllowedChannel('commoners:window:ready:renderer:pong')).toBe(true)
  })

  test('Allows services: prefixed channels', () => {
    expect(isAllowedChannel('services:http:status')).toBe(true)
    expect(isAllowedChannel('services:myService:closed')).toBe(true)
  })

  test('Allows plugins: prefixed channels', () => {
    expect(isAllowedChannel('plugins:splash:ready')).toBe(true)
    expect(isAllowedChannel('plugins:checks:echo')).toBe(true)
  })

  test('Blocks internal Electron channels', () => {
    expect(isAllowedChannel('ELECTRON_BROWSER_SANDBOX_LOAD')).toBe(false)
    expect(isAllowedChannel('ELECTRON_INTERNAL_IPC_MESSAGE')).toBe(false)
  })

  test('Blocks arbitrary channels', () => {
    expect(isAllowedChannel('arbitrary:channel')).toBe(false)
    expect(isAllowedChannel('malicious')).toBe(false)
    expect(isAllowedChannel('')).toBe(false)
    expect(isAllowedChannel('COMMONERS:UPPER')).toBe(false) // Case-sensitive
  })
})

// ────────────────────────────────────────────────────────
// 2. Origin Validation
// ────────────────────────────────────────────────────────

// Mirror the protocol.ts isAllowedOrigin helper
function isAllowedOrigin(source: string, scheme: string, devServerUrl?: string): boolean {
  if (!source) return true
  const isAppOrigin = source.startsWith(`${scheme}://`)
  const isDevOrigin = !!devServerUrl && source.startsWith(devServerUrl)
  const isFileOrigin = source.startsWith('file://')
  return isAppOrigin || isDevOrigin || isFileOrigin
}

describe('Origin Validation', () => {
  const scheme = 'myapp'
  const devUrl = 'http://localhost:5173'

  test('Allows empty origin (same-origin navigation)', () => {
    expect(isAllowedOrigin('', scheme)).toBe(true)
  })

  test('Allows app protocol origin', () => {
    expect(isAllowedOrigin('myapp://pages/index.html', scheme)).toBe(true)
    expect(isAllowedOrigin('myapp://services/http', scheme)).toBe(true)
  })

  test('Allows file:// origin', () => {
    expect(isAllowedOrigin('file:///path/to/app', scheme)).toBe(true)
  })

  test('Allows dev server origin when provided', () => {
    expect(isAllowedOrigin('http://localhost:5173/page', scheme, devUrl)).toBe(true)
  })

  test('Blocks external origins', () => {
    expect(isAllowedOrigin('https://evil.com', scheme)).toBe(false)
    expect(isAllowedOrigin('http://attacker.local:8080', scheme)).toBe(false)
  })

  test('Blocks dev server origin when not in dev mode', () => {
    expect(isAllowedOrigin('http://localhost:5173/page', scheme)).toBe(false)
    expect(isAllowedOrigin('http://localhost:5173/page', scheme, undefined)).toBe(false)
  })

  test('Blocks mismatched protocol scheme', () => {
    expect(isAllowedOrigin('otherapp://pages', scheme)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────
// 3. SHA-256 Correctness
// ────────────────────────────────────────────────────────

describe('SHA-256 Hashing', () => {
  test('Produces correct hash for known input', () => {
    const input = Buffer.from('hello world')
    const hash = createHash('sha256').update(input).digest('hex')
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  test('Different inputs produce different hashes', () => {
    const hash1 = createHash('sha256').update(Buffer.from('file-a')).digest('hex')
    const hash2 = createHash('sha256').update(Buffer.from('file-b')).digest('hex')
    expect(hash1).not.toBe(hash2)
  })

  test('Empty input produces known hash', () => {
    const hash = createHash('sha256').update(Buffer.from('')).digest('hex')
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

// ────────────────────────────────────────────────────────
// 4. Service Hash Comparison Logic
// ────────────────────────────────────────────────────────

describe('Service Binary Integrity', () => {
  const knownHash = createHash('sha256').update(Buffer.from('trusted-binary-content')).digest('hex')

  test('Matching hashes pass integrity check', () => {
    const actual = createHash('sha256').update(Buffer.from('trusted-binary-content')).digest('hex')
    expect(actual).toBe(knownHash)
  })

  test('Mismatching hashes fail integrity check', () => {
    const tampered = createHash('sha256').update(Buffer.from('tampered-binary-content')).digest('hex')
    expect(tampered).not.toBe(knownHash)
  })

  test('Hash manifest lookup works correctly', () => {
    const manifest: Record<string, string> = {
      http: 'abc123',
      express: 'def456',
    }
    expect(manifest['http']).toBe('abc123')
    expect(manifest['unknown']).toBeUndefined()
  })
})

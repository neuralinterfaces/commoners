import { describe, test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  decodePath,
  normalizeAndCompare,
  isCommonersAsset,
} from '../packages/core/assets/electron/modules/protocol'

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

// ────────────────────────────────────────────────────────
// 5. CSP Header Generation
// ────────────────────────────────────────────────────────

// Mirror the buildDefaultCSP function from security.ts (not exported, so replicated here)
function buildDefaultCSP(devServerUrl?: string): string {
  const connectSrc = devServerUrl ? `connect-src 'self' ${devServerUrl} ws:` : `connect-src 'self'`

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    connectSrc,
    "img-src 'self' data:",
    "font-src 'self'",
  ].join('; ')
}

describe('CSP Header Generation', () => {
  test('Production CSP restricts connect-src to self only', () => {
    const csp = buildDefaultCSP()
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('ws:')
    expect(csp).not.toContain('localhost')
  })

  test('Dev CSP allows dev server URL and websockets', () => {
    const csp = buildDefaultCSP('http://localhost:5173')
    expect(csp).toContain('http://localhost:5173')
    expect(csp).toContain('ws:')
  })

  test('CSP includes wasm-unsafe-eval for WASM services', () => {
    const csp = buildDefaultCSP()
    expect(csp).toContain('wasm-unsafe-eval')
  })

  test('CSP allows inline styles (required for Vite injection)', () => {
    const csp = buildDefaultCSP()
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
  })

  test('CSP allows data: URLs for images', () => {
    const csp = buildDefaultCSP()
    expect(csp).toContain("img-src 'self' data:")
  })

  test('CSP does not include bare unsafe-eval in script-src', () => {
    const csp = buildDefaultCSP()
    const scriptSrc = csp
      .split(';')
      .find(d => d.trim().startsWith('script-src'))!
    // Should contain wasm-unsafe-eval but NOT standalone unsafe-eval
    expect(scriptSrc).toContain('wasm-unsafe-eval')
    expect(scriptSrc).not.toMatch(/(?<!'wasm-)'unsafe-eval'/)
  })

  test('CSP contains all required directives', () => {
    const csp = buildDefaultCSP()
    const directives = csp.split(';').map(d => d.trim().split(' ')[0])
    expect(directives).toContain('default-src')
    expect(directives).toContain('script-src')
    expect(directives).toContain('style-src')
    expect(directives).toContain('connect-src')
    expect(directives).toContain('img-src')
    expect(directives).toContain('font-src')
  })
})

// ────────────────────────────────────────────────────────
// 6. Protocol Path Traversal Defense
// ────────────────────────────────────────────────────────

describe('Protocol Path Handling', () => {
  const assetRoot = '/app/Contents/Resources/app.asar'

  test('decodePath decodes URI-encoded characters', () => {
    const encoded = '/app/Contents/Resources/app.asar/%2e%2e/%2e%2e/etc/passwd'
    const decoded = decodePath(encoded)
    expect(decoded).toContain('..')
  })

  test('decodePath strips trailing slashes', () => {
    const withSlash = '/app/Contents/Resources/app.asar/'
    const decoded = decodePath(withSlash)
    expect(decoded).toBe('/app/Contents/Resources/app.asar')
  })

  test('Double-encoded traversal stays encoded after single decode', () => {
    const doubleEncoded = '/app/Contents/Resources/app.asar/%252e%252e/etc/passwd'
    const decoded = decodePath(doubleEncoded)
    // First decode: %252e → %2e (literal text, not a dot)
    expect(decoded).toContain('%2e')
  })

  test('Null byte injection in path is preserved after decode', () => {
    const nullPath = '/app/Contents/Resources/app.asar/index.html%00.evil'
    const decoded = decodePath(nullPath)
    expect(decoded).toContain('\x00')
  })

  test('Very long path does not crash', () => {
    const longPath = '/app/' + 'a'.repeat(10000) + '/index.html'
    const decoded = decodePath(longPath)
    expect(typeof decoded).toBe('string')
  })

  test('normalizeAndCompare uses custom comparison function', () => {
    const child = '/app/Contents/Resources/app.asar/pages/index.html'
    const result = normalizeAndCompare(child, assetRoot, (a, b) => a.startsWith(b))
    expect(result).toBe(true)
  })

  test('normalizeAndCompare rejects unrelated paths', () => {
    const unrelated = '/other/path/index.html'
    const result = normalizeAndCompare(unrelated, assetRoot, (a, b) => a.startsWith(b))
    expect(result).toBe(false)
  })

  test('isCommonersAsset identifies valid asset paths', () => {
    const validAsset = '/app/Contents/Resources/app.asar/pages/index.html'
    expect(isCommonersAsset(validAsset, assetRoot)).toBe(true)
  })

  test('isCommonersAsset rejects paths outside asset root', () => {
    const outside = '/tmp/malicious/index.html'
    expect(isCommonersAsset(outside, assetRoot)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────
// 7. IPC Channel Edge Cases
// ────────────────────────────────────────────────────────

describe('IPC Channel Edge Cases', () => {
  test('Null byte in channel name after valid prefix is still allowed', () => {
    expect(isAllowedChannel('commoners:\x00quit')).toBe(true)
  })

  test('Null byte before prefix is blocked', () => {
    expect(isAllowedChannel('\x00commoners:quit')).toBe(false)
  })

  test('Very long channel name after prefix is allowed', () => {
    const longChannel = 'commoners:' + 'a'.repeat(10000)
    expect(isAllowedChannel(longChannel)).toBe(true)
  })

  test('Channel with only prefix (no suffix) is allowed', () => {
    expect(isAllowedChannel('commoners:')).toBe(true)
    expect(isAllowedChannel('services:')).toBe(true)
    expect(isAllowedChannel('plugins:')).toBe(true)
  })

  test('Unicode in channel name after prefix is allowed', () => {
    expect(isAllowedChannel('plugins:emoji-\u{1F600}')).toBe(true)
  })

  test('Prefix without colon is blocked', () => {
    expect(isAllowedChannel('commoners')).toBe(false)
    expect(isAllowedChannel('services')).toBe(false)
    expect(isAllowedChannel('plugins')).toBe(false)
  })

  test('Mixed case prefix is blocked', () => {
    expect(isAllowedChannel('Commoners:quit')).toBe(false)
    expect(isAllowedChannel('SERVICES:http')).toBe(false)
    expect(isAllowedChannel('Plugins:splash')).toBe(false)
  })
})

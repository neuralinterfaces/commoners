import { describe, test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  decodePath,
  normalizeAndCompare,
  isCommonersAsset,
} from '../packages/core/assets/electron/modules/protocol'
import {
  validateIPCMessage,
  CHANNEL_REGISTRY,
  SCOPED_CHANNEL_VALIDATORS,
} from '../packages/core/assets/electron/modules/ipc-channels'
import {
  checkWindowsDependencies,
  detectArchitectureMismatch,
} from '../packages/core/utils/asar/windows-ffi'
import { checkDependencies } from '../packages/core/utils/asar/dependencies'

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
function buildDefaultCSP(devServerUrl?: string, serviceUrls?: string[], scriptHash?: string): string {
  const connectSources = ["'self'"]
  if (devServerUrl) connectSources.push(devServerUrl, 'ws:')
  if (serviceUrls) connectSources.push(...serviceUrls)

  const scriptInline = scriptHash || "'unsafe-inline'"

  return [
    "default-src 'self'",
    `script-src 'self' ${scriptInline} 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources.join(' ')}`,
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

// ────────────────────────────────────────────────────────
// 8. Port Randomization
// ────────────────────────────────────────────────────────

describe('Port Randomization', () => {
  test('getFreePorts returns valid unique ports in range 1024-65535', async () => {
    const { getFreePorts } = await import(
      '../packages/core/assets/services/network'
    )
    const ports = await getFreePorts(5)
    expect(ports).toHaveLength(5)
    const unique = new Set(ports)
    expect(unique.size).toBe(5)
    for (const port of ports) {
      expect(port).toBeGreaterThanOrEqual(1024)
      expect(port).toBeLessThanOrEqual(65535)
    }
  })

  test('getFreePorts(1) returns a single-element array', async () => {
    const { getFreePorts } = await import(
      '../packages/core/assets/services/network'
    )
    const ports = await getFreePorts(1)
    expect(ports).toHaveLength(1)
    expect(typeof ports[0]).toBe('number')
  })
})

// ────────────────────────────────────────────────────────
// 9. CSP with Service URLs
// ────────────────────────────────────────────────────────

describe('CSP with Service URLs', () => {
  test('Service URLs are included in connect-src', () => {
    const csp = buildDefaultCSP(undefined, [
      'http://localhost:3000',
      'http://localhost:4000',
    ])
    expect(csp).toContain('http://localhost:3000')
    expect(csp).toContain('http://localhost:4000')
    expect(csp).toContain("connect-src 'self' http://localhost:3000 http://localhost:4000")
  })

  test('Service URLs combine with dev server URL', () => {
    const csp = buildDefaultCSP('http://localhost:5173', [
      'http://localhost:3000',
    ])
    expect(csp).toContain('http://localhost:5173')
    expect(csp).toContain('ws:')
    expect(csp).toContain('http://localhost:3000')
  })

  test('Empty service URLs array does not affect CSP', () => {
    const cspWithEmpty = buildDefaultCSP(undefined, [])
    const cspWithout = buildDefaultCSP()
    expect(cspWithEmpty).toBe(cspWithout)
  })

  test('Production CSP with service URLs omits ws:', () => {
    const csp = buildDefaultCSP(undefined, ['http://localhost:3000'])
    expect(csp).not.toContain('ws:')
    expect(csp).toContain('http://localhost:3000')
  })
})

// ────────────────────────────────────────────────────────
// 10. Service Binary Integrity Edge Cases
// ────────────────────────────────────────────────────────

describe('Service Binary Integrity Edge Cases', () => {
  test('Empty manifest has no entries to verify', () => {
    const manifest: Record<string, string> = {}
    expect(Object.keys(manifest)).toHaveLength(0)
    expect(manifest['anyService']).toBeUndefined()
  })

  test('Missing service ID returns undefined from manifest', () => {
    const manifest: Record<string, string> = {
      http: createHash('sha256').update(Buffer.from('binary-content')).digest('hex'),
    }
    expect(manifest['http']).toBeDefined()
    expect(manifest['nonexistent']).toBeUndefined()
  })

  test('Manifest with multiple services has independent hashes', () => {
    const hash1 = createHash('sha256').update(Buffer.from('binary-1')).digest('hex')
    const hash2 = createHash('sha256').update(Buffer.from('binary-2')).digest('hex')
    const manifest: Record<string, string> = { svc1: hash1, svc2: hash2 }
    expect(manifest['svc1']).not.toBe(manifest['svc2'])
    expect(manifest['svc1']).toBe(hash1)
    expect(manifest['svc2']).toBe(hash2)
  })
})

// ────────────────────────────────────────────────────────
// 11. IPC Message Schema Validation
// ────────────────────────────────────────────────────────

describe('IPC Message Schema Validation', () => {
  test('commoners:quit accepts 0 args', () => {
    expect(validateIPCMessage('commoners:quit', [])).toBeNull()
  })

  test('commoners:quit accepts 1 string arg', () => {
    expect(validateIPCMessage('commoners:quit', ['shutdown'])).toBeNull()
  })

  test('commoners:quit rejects number arg', () => {
    const result = validateIPCMessage('commoners:quit', [42])
    expect(result).toContain('expected string')
    expect(result).toContain('got number')
  })

  test('commoners:quit rejects too many args', () => {
    const result = validateIPCMessage('commoners:quit', ['a', 'b'])
    expect(result).toContain('at most 1')
  })

  test('commoners:close requires 1 number arg', () => {
    expect(validateIPCMessage('commoners:close', [1])).toBeNull()
  })

  test('commoners:close rejects 0 args', () => {
    const result = validateIPCMessage('commoners:close', [])
    expect(result).toContain('at least 1')
  })

  test('commoners:close rejects string arg', () => {
    const result = validateIPCMessage('commoners:close', ['notanumber'])
    expect(result).toContain('expected number')
    expect(result).toContain('got string')
  })

  test('commoners:services accepts 0 args', () => {
    expect(validateIPCMessage('commoners:services', [])).toBeNull()
  })

  test('commoners:plugins:loaded requires 2 args (number, string)', () => {
    expect(validateIPCMessage('commoners:plugins:loaded', [1, 'splash'])).toBeNull()
  })

  test('commoners:plugins:loaded rejects wrong types', () => {
    const result = validateIPCMessage('commoners:plugins:loaded', ['notnum', 123])
    expect(result).toContain('expected number')
  })

  test('Unknown channels return null (pass-through)', () => {
    expect(validateIPCMessage('unknown:channel', [1, 2, 3])).toBeNull()
    expect(validateIPCMessage('custom:event', [])).toBeNull()
  })

  test('Scoped status expects 0 args', () => {
    expect(validateIPCMessage('services:http:status', [])).toBeNull()
    const result = validateIPCMessage('services:http:status', ['extra'])
    expect(result).toContain('at most 0')
  })

  test('Scoped closed validates number', () => {
    expect(validateIPCMessage('services:http:closed', [0])).toBeNull()
    const result = validateIPCMessage('services:http:closed', ['notnum'])
    expect(result).toContain('expected number')
  })

  test('Scoped log validates string', () => {
    expect(validateIPCMessage('plugins:splash:log', ['hello'])).toBeNull()
    const result = validateIPCMessage('plugins:splash:log', [42])
    expect(result).toContain('expected string')
  })

  test('Registry completeness: all validators have minArgs <= maxArgs', () => {
    for (const [channel, validator] of Object.entries(CHANNEL_REGISTRY)) {
      expect(validator.minArgs).toBeLessThanOrEqual(validator.maxArgs)
    }
    for (const [attr, validator] of Object.entries(SCOPED_CHANNEL_VALIDATORS)) {
      expect(validator.minArgs).toBeLessThanOrEqual(validator.maxArgs)
    }
  })

  test('Registry completeness: argType indices are in range', () => {
    for (const [channel, validator] of Object.entries(CHANNEL_REGISTRY)) {
      if (validator.argTypes) {
        expect(validator.argTypes.length).toBeLessThanOrEqual(validator.maxArgs)
      }
    }
    for (const [attr, validator] of Object.entries(SCOPED_CHANNEL_VALIDATORS)) {
      if (validator.argTypes) {
        expect(validator.argTypes.length).toBeLessThanOrEqual(validator.maxArgs)
      }
    }
  })
})

// ────────────────────────────────────────────────────────
// 12. Windows ASAR Dependencies (Non-Windows Safe)
// ────────────────────────────────────────────────────────

describe('Windows ASAR Dependencies', () => {
  test('checkWindowsDependencies returns ffi/rcedit false on non-Windows', () => {
    const status = checkWindowsDependencies()
    if (process.platform !== 'win32') {
      expect(status.ffiAvailable).toBe(false)
      expect(status.rceditAvailable).toBe(false)
    }
  })

  test('checkDependencies returns expected shape', () => {
    const deps = checkDependencies()
    expect(typeof deps.ffi).toBe('boolean')
    expect(typeof deps.rcedit).toBe('boolean')
    expect(typeof deps.plist).toBe('boolean')
    expect(typeof deps.fuses).toBe('boolean')
  })

  test('detectArchitectureMismatch returns null on non-Windows', () => {
    if (process.platform !== 'win32') {
      expect(detectArchitectureMismatch('x64')).toBeNull()
      expect(detectArchitectureMismatch('arm64')).toBeNull()
    }
  })

  test('detectArchitectureMismatch returns null when no targetArch', () => {
    expect(detectArchitectureMismatch()).toBeNull()
    expect(detectArchitectureMismatch(undefined)).toBeNull()
  })

  test('checkDependencies with targetArch includes architectureWarning field', () => {
    const deps = checkDependencies('arm64')
    if (process.platform !== 'win32') {
      expect(deps.architectureWarning).toBeUndefined()
    }
    // On any platform, the field should be either string or undefined
    expect(
      deps.architectureWarning === undefined || typeof deps.architectureWarning === 'string'
    ).toBe(true)
  })
})

// ────────────────────────────────────────────────────────
// 13. CSP with Script Hash
// ────────────────────────────────────────────────────────

describe('CSP with Script Hash', () => {
  const testHash = "'sha256-" + createHash('sha256').update('test script', 'utf8').digest('base64') + "'"

  test('Production CSP with hash: script-src contains hash, no unsafe-inline', () => {
    const csp = buildDefaultCSP(undefined, undefined, testHash)
    expect(csp).toContain(testHash)
    // script-src should have the hash, not unsafe-inline
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'))!
    expect(scriptSrc).toContain(testHash)
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    // style-src should still have unsafe-inline
    const styleSrc = csp.split(';').find(d => d.trim().startsWith('style-src'))!
    expect(styleSrc).toContain("'unsafe-inline'")
  })

  test('Dev CSP without hash: retains unsafe-inline', () => {
    const csp = buildDefaultCSP('http://localhost:5173')
    expect(csp).toContain("'unsafe-inline'")
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src'))!
    expect(scriptSrc).toContain("'unsafe-inline'")
  })

  test('style-src always retains unsafe-inline regardless of hash', () => {
    const csp = buildDefaultCSP(undefined, undefined, testHash)
    const styleSrc = csp.split(';').find(d => d.trim().startsWith('style-src'))!
    expect(styleSrc).toContain("'unsafe-inline'")
  })

  test('Hash format matches sha256 pattern', () => {
    expect(testHash).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/)
  })

  test('wasm-unsafe-eval always present regardless of hash', () => {
    const csp = buildDefaultCSP(undefined, undefined, testHash)
    expect(csp).toContain('wasm-unsafe-eval')
  })

  test('Service URLs still in connect-src when hash is set', () => {
    const csp = buildDefaultCSP(undefined, ['http://localhost:3000'], testHash)
    expect(csp).toContain('http://localhost:3000')
    expect(csp).toContain(testHash)
  })
})

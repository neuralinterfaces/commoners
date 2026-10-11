import { expect, test, describe } from 'vitest'

import {
  decodePath,
  normalizeAndCompare,
  isValidUrl,
  isCommonersUrl,
  isCommonersAsset,
  isAllowedOrigin,
  isAppOriginUrl,
  toAppOriginUrl,
  fromAppOriginUrl,
  appOriginHeaders,
  isAllowedExternal,
} from '../packages/core/assets/electron/modules/protocol'

describe('Protocol Utilities', () => {
  describe('decodePath', () => {
    test('removes trailing slashes', () => {
      expect(decodePath('/path/to/file/')).toBe('/path/to/file')
    })

    test('removes multiple trailing slashes', () => {
      expect(decodePath('/path/to/file///')).toBe('/path/to/file')
    })

    test('decodes URI-encoded characters', () => {
      expect(decodePath('/path/to/my%20file')).toBe('/path/to/my file')
    })

    test('handles empty string', () => {
      expect(decodePath('')).toBe('')
    })

    test('handles path with no trailing slash', () => {
      expect(decodePath('/path/to/file')).toBe('/path/to/file')
    })

    test('handles root path', () => {
      expect(decodePath('/')).toBe('')
    })
  })

  describe('normalizeAndCompare', () => {
    test('compares equal paths', () => {
      expect(normalizeAndCompare('/path/to/file', '/path/to/file')).toBe(true)
    })

    test('compares different paths', () => {
      expect(normalizeAndCompare('/path/to/file', '/other/path')).toBe(false)
    })

    test('normalizes trailing slashes before comparison', () => {
      expect(normalizeAndCompare('/path/to/file/', '/path/to/file')).toBe(true)
    })

    test('decodes URI-encoded paths before comparison', () => {
      expect(normalizeAndCompare('/path/my%20file', '/path/my file')).toBe(true)
    })

    test('supports custom comparison function', () => {
      expect(normalizeAndCompare('/path/to/file', '/path', (a, b) => a.startsWith(b))).toBe(true)
    })

    test('custom comparison can return false', () => {
      expect(normalizeAndCompare('/other/path', '/path', (a, b) => a.startsWith(b))).toBe(false)
    })
  })

  describe('isValidUrl', () => {
    test('valid HTTP URL', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true)
    })

    test('valid HTTPS URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
    })

    test('valid file URL', () => {
      expect(isValidUrl('file:///path/to/file')).toBe(true)
    })

    test('valid custom protocol URL', () => {
      expect(isValidUrl('commoners://pages/home')).toBe(true)
    })

    test('invalid URL - plain path', () => {
      expect(isValidUrl('/path/to/file')).toBe(false)
    })

    test('invalid URL - empty string', () => {
      expect(isValidUrl('')).toBe(false)
    })

    test('invalid URL - random string', () => {
      expect(isValidUrl('not-a-url')).toBe(false)
    })
  })

  describe('isCommonersUrl', () => {
    test('file:// URLs are always Commoners URLs', () => {
      expect(isCommonersUrl('file:///path/to/app/index.html')).toBe(true)
    })

    test('matches dev server origin', () => {
      expect(isCommonersUrl('http://localhost:5173/index.html', 'http://localhost:5173')).toBe(true)
    })

    test('does not match different origins', () => {
      expect(isCommonersUrl('https://example.com/page', 'http://localhost:5173')).toBe(false)
    })

    test('returns false for non-URL strings', () => {
      expect(isCommonersUrl('/path/to/file')).toBe(false)
    })

    test('returns false without dev server for non-file URLs', () => {
      expect(isCommonersUrl('http://localhost:5173/page')).toBe(false)
    })
  })

  describe('isCommonersAsset', () => {
    const assetRoot = '/app/dist'

    test('file path under asset root is an asset', () => {
      expect(isCommonersAsset('/app/dist/index.html', assetRoot)).toBe(true)
    })

    test('file path outside asset root is not an asset', () => {
      expect(isCommonersAsset('/other/path/file.html', assetRoot)).toBe(false)
    })

    test('file:// URL is an asset', () => {
      expect(isCommonersAsset('file:///app/dist/index.html', assetRoot)).toBe(true)
    })

    test('dev server URL is an asset', () => {
      expect(
        isCommonersAsset('http://localhost:5173/index.html', assetRoot, 'http://localhost:5173')
      ).toBe(true)
    })

    test('external URL is not an asset', () => {
      expect(isCommonersAsset('https://example.com/page', assetRoot, 'http://localhost:5173')).toBe(
        false
      )
    })
  })
})

describe('App origin', () => {
  const root = '/Applications/My App.app/Contents/Resources/app.asar'

  test('maps files under the asset root to app://local and back', () => {
    const url = toAppOriginUrl(`${root}/pages/two words.html`, root)
    expect(url).toBe('app://local/pages/two%20words.html')
    expect(fromAppOriginUrl(url!)).toBe('pages/two words.html')
    expect(fromAppOriginUrl('app://local/')).toBe('index.html')
  })

  test('refuses files outside the asset root', () => {
    expect(toAppOriginUrl('/etc/passwd', root)).toBeNull()
    expect(toAppOriginUrl(`${root}-other/index.html`, root)).toBeNull()
  })

  test('refuses other origins and encoded escapes', () => {
    expect(fromAppOriginUrl('app://other/index.html')).toBeNull()
    expect(fromAppOriginUrl('file:///etc/passwd')).toBeNull()
    expect(fromAppOriginUrl('app://local/a/%2e%2e%2f%2e%2e%2fetc/passwd')).toBeNull()
    expect(fromAppOriginUrl('app://local/a%5c..%5csecret')).toBeNull()
  })

  test('counts as an app URL for navigation and protocol origin checks', () => {
    expect(isAppOriginUrl('app://local/index.html')).toBe(true)
    expect(isAppOriginUrl('app://localhost/index.html')).toBe(false)
    expect(isCommonersUrl('app://local/index.html')).toBe(true)
    expect(isAllowedOrigin('app://local', 'myapp')).toBe(true)
  })

  test('headers carry the CSP, and COOP/COEP/CORP only when isolation is on', () => {
    const plain = appOriginHeaders('index.html', { csp: "default-src 'self'" })
    expect(plain['Content-Type']).toBe('text/html; charset=utf-8')
    expect(plain['Content-Security-Policy']).toBe("default-src 'self'")
    expect(plain['X-Content-Type-Options']).toBe('nosniff')
    expect(plain['Cross-Origin-Embedder-Policy']).toBeUndefined()

    const isolated = appOriginHeaders('main.js', { csp: null, crossOriginIsolation: true })
    expect(isolated['Content-Security-Policy']).toBeUndefined()
    expect(isolated['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(isolated['Cross-Origin-Embedder-Policy']).toBe('require-corp')
    expect(isolated['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })
})

describe('External links', () => {
  test('web and mail links may open in the OS by default', () => {
    expect(isAllowedExternal('https://example.com')).toBe(true)
    expect(isAllowedExternal('http://example.com')).toBe(true)
    expect(isAllowedExternal('mailto:a@example.com')).toBe(true)
  })

  test('protocols that can launch local programs are refused by default', () => {
    expect(isAllowedExternal('file:///Applications/Calculator.app')).toBe(false)
    expect(isAllowedExternal('smb://host/share')).toBe(false)
    expect(isAllowedExternal('someapp://run?x=1')).toBe(false)
    expect(isAllowedExternal('not a url')).toBe(false)
  })

  test('an app can allow more protocols, with or without the colon', () => {
    expect(isAllowedExternal('zoommtg://join', ['https', 'zoommtg'])).toBe(true)
    expect(isAllowedExternal('mailto:a@example.com', ['https:'])).toBe(false)
  })
})

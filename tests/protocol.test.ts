import { expect, test, describe } from 'vitest'

import {
  decodePath,
  normalizeAndCompare,
  isValidUrl,
  isCommonersUrl,
  isCommonersAsset,
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
      expect(
        normalizeAndCompare('/path/to/file', '/path', (a, b) => a.startsWith(b))
      ).toBe(true)
    })

    test('custom comparison can return false', () => {
      expect(
        normalizeAndCompare('/other/path', '/path', (a, b) => a.startsWith(b))
      ).toBe(false)
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
      expect(
        isCommonersAsset('https://example.com/page', assetRoot, 'http://localhost:5173')
      ).toBe(false)
    })
  })
})

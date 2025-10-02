/**
 * Protocol Module
 *
 * Handles custom protocol registration and URL handling for Electron.
 * This module is responsible for:
 * - Custom protocol registration (e.g., myapp://)
 * - Path decoding and normalization
 * - Link type checking
 * - Protocol handler logic
 */

import { sep, posix } from 'node:path'

/**
 * Protocol configuration
 */
export interface ProtocolConfig {
  scheme: string
  privileges?: {
    standard?: boolean
    secure?: boolean
    bypassCSP?: boolean
    supportFetchAPI?: boolean
  }
}

/**
 * Decode and normalize a path for comparison
 * Removes trailing slashes and normalizes separators
 */
export function decodePath(path: string): string {
  const decoded = decodeURIComponent(path.replace(/\/+$/, '')) // Remove trailing slashes and decode
  return decoded.replaceAll(sep, posix.sep) // Normalize path separators for comparison
}

/**
 * Normalize two paths and compare them
 */
export function normalizeAndCompare(
  path1: string,
  path2: string,
  comparison: (a: string, b: string) => boolean = (a, b) => a === b
): boolean {
  path1 = decodePath(path1)
  path2 = decodePath(path2)
  return comparison(path1, path2)
}

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Check the type of link (webpage, download, unknown)
 */
export async function checkLinkType(url: string): Promise<'webpage' | 'download' | 'unknown'> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentDisposition = response.headers.get('Content-Disposition')

    if (contentDisposition && contentDisposition.includes('attachment')) {
      return 'download' // Download if attachment
    }

    const contentType = response.headers.get('Content-Type')
    if (contentType && !contentType.startsWith('text/html')) {
      return 'unknown' // Unknown if not HTML
    }

    return 'webpage'
  } catch (error) {
    return 'unknown'
  }
}

/**
 * Check if a URL is a Commoners asset URL
 */
export function isCommonersUrl(url: string, devServerUrl?: string): boolean {
  try {
    const urlObj = new URL(url)
    return (
      (devServerUrl && devServerUrl.startsWith(urlObj.origin)) || urlObj.protocol === 'file:'
    )
  } catch (e) {
    return false
  }
}

/**
 * Check if a location (path or URL) is a Commoners asset
 */
export function isCommonersAsset(
  location: string,
  assetRootDir: string,
  devServerUrl?: string
): boolean {
  if (isValidUrl(location)) {
    return isCommonersUrl(location, devServerUrl) // Check if it's a Commoners URL
  } else {
    const normalizedPath = decodePath(location)
    return normalizeAndCompare(normalizedPath, assetRootDir, (a, b) => a.startsWith(b))
  }
}

/**
 * Register a custom protocol scheme
 */
export function registerProtocolScheme(config: ProtocolConfig): void {
  const { protocol } = require('electron')

  const privilegesConfig = {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    ...(config.privileges || {}),
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: config.scheme,
      privileges: privilegesConfig,
    },
  ])
}

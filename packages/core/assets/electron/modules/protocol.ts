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
      (devServerUrl && devServerUrl.startsWith(urlObj.origin)) ||
      urlObj.protocol === 'file:' ||
      isAppOriginUrl(url)
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
 * Check if a request origin is allowed for custom protocol access.
 * Allows the app's own protocol, the dev server (in dev mode), and file:// origins.
 */
export function isAllowedOrigin(source: string, scheme: string, devServerUrl?: string): boolean {
  if (!source) return true // No origin header means same-origin or internal navigation
  const isAppOrigin = source.startsWith(`${scheme}://`)
  const isDevOrigin = !!devServerUrl && source.startsWith(devServerUrl)
  const isFileOrigin = source.startsWith('file://')
  return isAppOrigin || isDevOrigin || isFileOrigin || isAppOriginUrl(source)
}

// Every privileged scheme, re-registered as one list: registerSchemesAsPrivileged replaces the
// previous registration rather than adding to it
const privilegedSchemes: { scheme: string; privileges: Record<string, boolean> }[] = []

// Protocols shell.openExternal may hand to the OS. Others (file:, smb:, custom app schemes) can
// launch local programs, so they are refused unless the app allows them explicitly
export const DEFAULT_EXTERNAL_PROTOCOLS = ['https:', 'http:', 'mailto:']

export function isAllowedExternal(
  url: string,
  allowed: string[] = DEFAULT_EXTERNAL_PROTOCOLS
): boolean {
  try {
    const { protocol } = new URL(url)
    return allowed.map(p => (p.endsWith(':') ? p : `${p}:`).toLowerCase()).includes(protocol)
  } catch {
    return false
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

  const existing = privilegedSchemes.findIndex(s => s.scheme === config.scheme)
  if (existing !== -1) privilegedSchemes.splice(existing, 1)
  privilegedSchemes.push({ scheme: config.scheme, privileges: privilegesConfig })

  protocol.registerSchemesAsPrivileged(privilegedSchemes)
}

// ------------------------ App origin ------------------------
// Opt-in (electron.origin: 'app'): packaged pages are served from app://local instead of
// file://, so they have a real origin and the main process sets their response headers —
// CSP as a header, and COOP/COEP when crossOriginIsolation is on, which file:// cannot carry

export const APP_SCHEME = 'app'
export const APP_HOST = 'local'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

export const APP_SCHEME_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
}

export function isAppOriginUrl(url: string): boolean {
  try {
    const { protocol, host } = new URL(url)
    return protocol === `${APP_SCHEME}:` && host === APP_HOST
  } catch {
    return false
  }
}

/** File path under the asset root → app:// URL. null when the path is outside the root */
export function toAppOriginUrl(filePath: string, assetRoot: string): string | null {
  const file = decodePath(filePath)
  const root = decodePath(assetRoot)
  if (file !== root && !file.startsWith(root + '/')) return null
  const relative = file.slice(root.length).replace(/^\/+/, '')
  return `${APP_ORIGIN}/${relative.split('/').map(encodeURIComponent).join('/')}`
}

/** app:// URL → path relative to the asset root, or null for another origin or an escape */
export function fromAppOriginUrl(url: string): string | null {
  if (!isAppOriginUrl(url)) return null
  const segments = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean)
  if (segments.some(s => s === '..' || s.includes('\\') || s.includes('\0'))) return null
  return segments.join('/') || 'index.html'
}

const MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  icns: 'image/icns',
  wasm: 'application/wasm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  pdf: 'application/pdf',
}

export function mimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

/** Response headers for an app-origin file */
export function appOriginHeaders(
  path: string,
  options: { csp?: string | null; crossOriginIsolation?: boolean }
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': mimeType(path),
    'X-Content-Type-Options': 'nosniff',
  }
  if (options.csp) headers['Content-Security-Policy'] = options.csp
  if (options.crossOriginIsolation) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    headers['Cross-Origin-Resource-Policy'] = 'same-origin'
  }
  return headers
}

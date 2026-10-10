/**
 * Web/PWA security defaults (build only).
 *
 * - Each built page gets a meta CSP from the shared policy, with a sha256 hash for every
 *   inline script instead of 'unsafe-inline'.
 * - A `_headers` file (Netlify / Cloudflare Pages format, easy to port to other hosts)
 *   carries the full policy — including frame-ancestors, which a meta tag cannot set —
 *   and the headers no meta tag can express. The preview server serves the same file,
 *   so local preview matches hosting.
 */

import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

import { buildCSP, resolveCSP, type CSPOverride } from '../../assets/utils/csp.js'

export type WebSecurityOptions = {
  csp?: CSPOverride
  headers?: Record<string, string | false> | false // Extra or disabled response headers
  crossOriginIsolation?: boolean // COOP/COEP/CORP (SharedArrayBuffer, precise timers); breaks cross-origin embeds
  killSwitch?: boolean // Emit a self-unregistering sw.js (web target; default true)
}

export const CROSS_ORIGIN_ISOLATION_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Replaces a previously installed service worker at the same path: a PWA that is turned
// off keeps running its old worker (a 404 does not unregister it). Inert where none was installed.
export const KILL_SWITCH_SW = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.navigate(client.url)))
  )
})
`

export const HEADERS_FILE = '_headers'

const DEFAULT_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=63072000', // Ignored over plain HTTP (e.g. local preview)
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi

const inlineScriptHashes = (html: string) =>
  [...html.matchAll(INLINE_SCRIPT)]
    .map(([, body]) => body)
    .filter(body => body.trim())
    .map(body => `'sha256-${createHash('sha256').update(body).digest('base64')}'`)

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** Pure core: pages in, pages (with meta CSP) and `_headers` contents out. */
export const applyWebSecurity = (
  pages: Record<string, string>,
  options: WebSecurityOptions = {}
) => {
  const allHashes: string[] = []
  const out: Record<string, string> = {}

  for (const [name, html] of Object.entries(pages)) {
    const hashes = inlineScriptHashes(html)
    allHashes.push(...hashes)
    const meta = resolveCSP(buildCSP({ scriptHashes: hashes }), options.csp, 'meta')
    out[name] = meta
      ? html.replace(
          /<head[^>]*>/i,
          tag =>
            `${tag}<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(meta)}">`
        )
      : html
  }

  const headers: Record<string, string | false> = {
    ...DEFAULT_HEADERS,
    ...(options.crossOriginIsolation ? CROSS_ORIGIN_ISOLATION_HEADERS : {}),
  }
  const csp = resolveCSP(buildCSP({ scriptHashes: allHashes }), options.csp, 'header')
  if (csp) headers['Content-Security-Policy'] = csp
  if (options.headers === false) for (const key of Object.keys(DEFAULT_HEADERS)) delete headers[key]
  else Object.assign(headers, options.headers ?? {})

  const lines = Object.entries(headers)
    .filter(([, value]) => value !== false)
    .map(([key, value]) => `  ${key}: ${value}`)

  return { pages: out, headers: `/*\n${lines.join('\n')}\n` }
}

/** Parse a `_headers` file back into a header map (for the preview server). */
export const parseHeadersFile = (text: string) =>
  Object.fromEntries(
    text
      .split('\n')
      .filter(line => /^\s+\S/.test(line) && line.includes(':'))
      .map(line => {
        const index = line.indexOf(':')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      })
  )

export default function webSecurityPlugin(
  options: WebSecurityOptions = {},
  { pwa = false }: { pwa?: boolean } = {}
): Plugin {
  return {
    name: 'commoners:web-security',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const pages: Record<string, string> = {}
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.html'))
          pages[fileName] = String(chunk.source)
      }
      if (!Object.keys(pages).length) return

      const { pages: secured, headers } = applyWebSecurity(pages, options)
      for (const [fileName, html] of Object.entries(secured)) {
        const chunk = bundle[fileName]
        if (chunk.type === 'asset') chunk.source = html
      }
      this.emitFile({ type: 'asset', fileName: HEADERS_FILE, source: headers })
      // Plain web builds only: a PWA build ships its own worker at this path
      if (!pwa && options.killSwitch !== false && !bundle['sw.js'])
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: KILL_SWITCH_SW })
    },
  }
}

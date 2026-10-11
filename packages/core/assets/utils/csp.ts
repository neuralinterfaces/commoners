/**
 * Content Security Policy shared by every target (Electron, Tauri, web/PWA).
 *
 * One base policy; each target only adds what it genuinely needs (dev server and
 * services in connect-src, Tauri IPC origins, inline-script hashes). Users override
 * per directive, replace it with a string, or disable it with false.
 */

export type CSPDirectives = Record<string, string[]>
export type CSPOverride = string | false | CSPDirectives

type BuildOptions = {
  connect?: string[] // Extra connect-src sources (dev server, services, IPC)
  scriptHashes?: string[] // 'sha256-…' sources for inline scripts
  allowInlineScripts?: boolean // Dev only: when hashes cannot be known ahead of time
}

const unique = (values: string[]) => [...new Set(values)]

export const buildCSP = ({
  connect = [],
  scriptHashes = [],
  allowInlineScripts = false,
}: BuildOptions = {}): CSPDirectives => ({
  'default-src': ["'self'"],
  'script-src': unique([
    "'self'",
    ...(allowInlineScripts ? ["'unsafe-inline'"] : scriptHashes),
    "'wasm-unsafe-eval'",
  ]),
  // Module and blob workers (Vite's worker pattern resolves to blob: in dev)
  'worker-src': ["'self'", 'blob:'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'connect-src': unique(["'self'", ...connect]),
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"], // Header-only: browsers ignore it in a meta tag
})

// Directives a <meta http-equiv> CSP cannot carry
const HEADER_ONLY = ['frame-ancestors', 'report-uri', 'sandbox']

export const serializeCSP = (directives: CSPDirectives, form: 'header' | 'meta' = 'header') =>
  Object.entries(directives)
    .filter(([name]) => form === 'header' || !HEADER_ONLY.includes(name))
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ')

/** Apply a user override. Returns the policy string, or null when CSP is disabled. */
export const resolveCSP = (
  base: CSPDirectives,
  override?: CSPOverride,
  form: 'header' | 'meta' = 'header'
): string | null => {
  if (override === false) return null
  if (typeof override === 'string') return override
  return serializeCSP({ ...base, ...(override ?? {}) }, form)
}

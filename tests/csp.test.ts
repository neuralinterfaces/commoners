import { describe, test, expect } from 'vitest'

import { buildCSP, resolveCSP, serializeCSP } from '../packages/core/assets/utils/csp'
import { applyWebSecurity, KILL_SWITCH_SW } from '../packages/core/vite/plugins/web-security'
import { createHash } from 'node:crypto'

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`

describe('buildCSP: the one policy every target starts from', () => {
  const csp = buildCSP()

  test('locks down plugins, base URLs and form targets', () => {
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
  })

  test('allows workers and WASM the same way on every target', () => {
    expect(csp['worker-src']).toEqual(["'self'", 'blob:'])
    expect(csp['script-src']).toContain("'wasm-unsafe-eval'")
  })

  test('never allows inline scripts unless asked; hashes are added instead', () => {
    expect(csp['script-src']).not.toContain("'unsafe-inline'")
    expect(buildCSP({ scriptHashes: ["'sha256-abc'"] })['script-src']).toContain("'sha256-abc'")
    expect(buildCSP({ allowInlineScripts: true })['script-src']).toContain("'unsafe-inline'")
  })

  test('adds connect sources and keeps them unique', () => {
    expect(buildCSP({ connect: ['ipc:', 'ipc:', 'http://localhost:*'] })['connect-src']).toEqual([
      "'self'",
      'ipc:',
      'http://localhost:*',
    ])
  })

  test('frame-ancestors only appears in header form (meta tags ignore it)', () => {
    expect(serializeCSP(buildCSP(), 'header')).toContain("frame-ancestors 'none'")
    expect(serializeCSP(buildCSP(), 'meta')).not.toContain('frame-ancestors')
  })
})

describe('resolveCSP: user overrides', () => {
  test('false disables, a string replaces, an object overrides per directive', () => {
    expect(resolveCSP(buildCSP(), false)).toBeNull()
    expect(resolveCSP(buildCSP(), "default-src 'none'")).toBe("default-src 'none'")
    const merged = resolveCSP(buildCSP(), { 'img-src': ["'self'", 'https://cdn.example'] })!
    expect(merged).toContain("img-src 'self' https://cdn.example")
    expect(merged).toContain("object-src 'none'")
  })
})

describe('web/PWA builds', () => {
  const page = `<!doctype html><html><head><title>x</title><script>window.boot = 1</script></head><body><script type="module" src="/assets/app.js"></script></body></html>`

  test('inject a meta CSP that hashes inline scripts', () => {
    const { pages } = applyWebSecurity({ 'index.html': page })
    const html = pages['index.html']
    expect(html).toMatch(/<head><meta http-equiv="Content-Security-Policy" content="[^"]+">/)
    expect(html).toContain(sha256('window.boot = 1'))
    expect(html.match(/script-src [^;]*/)![0]).not.toContain('unsafe-inline')
  })

  test('emit a _headers file with the full policy and the headers a meta tag cannot set', () => {
    const { headers } = applyWebSecurity({ 'index.html': page })
    expect(headers).toMatch(/^\/\*\n/)
    expect(headers).toContain("frame-ancestors 'none'")
    expect(headers).toContain(sha256('window.boot = 1')) // Union of every page's inline hashes
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin')
  })

  test('csp: false skips the policy but keeps the other headers', () => {
    const { pages, headers } = applyWebSecurity({ 'index.html': page }, { csp: false })
    expect(pages['index.html']).not.toContain('Content-Security-Policy')
    expect(headers).not.toContain('Content-Security-Policy')
    expect(headers).toContain('X-Content-Type-Options: nosniff')
  })

  // Opt-in: COEP breaks third-party embeds, fonts and OAuth popups
  test('cross-origin isolation adds COOP/COEP/CORP only when enabled', () => {
    const { headers } = applyWebSecurity({ 'index.html': page }, { crossOriginIsolation: true })
    expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin')
    expect(headers).toContain('Cross-Origin-Embedder-Policy: require-corp')
    expect(headers).toContain('Cross-Origin-Resource-Policy: same-origin')
    expect(applyWebSecurity({ 'index.html': page }).headers).not.toContain(
      'Cross-Origin-Opener-Policy'
    )
  })
})

// Packaged Electron loads pages from file://, where response headers never apply: the
// policy has to be in the page itself, with local services allowed in connect-src
describe('desktop (Electron) builds', () => {
  const page = `<!doctype html><html><head><script>window.boot = 1</script></head><body></body></html>`

  test('get the meta CSP with local services in connect-src', () => {
    const { pages } = applyWebSecurity(
      { 'index.html': page },
      {},
      { connect: ['http://localhost:*', 'ws://localhost:*'] }
    )
    const meta = pages['index.html'].match(/content="([^"]+)"/)![1]
    expect(meta).toContain("connect-src 'self' http://localhost:* ws://localhost:*")
    expect(meta).toContain(sha256('window.boot = 1'))
    expect(meta).not.toContain('frame-ancestors')
  })
})

// A previously installed PWA worker survives the PWA being turned off (a 404 does not
// unregister it); web builds ship a worker that unregisters itself and reloads its pages
describe('service worker kill switch', () => {
  test('unregisters itself and reloads controlled pages', () => {
    expect(KILL_SWITCH_SW).toContain('skipWaiting')
    expect(KILL_SWITCH_SW).toContain('registration.unregister()')
    expect(KILL_SWITCH_SW).toContain('navigate')
  })
})

import { describe, test, expect, afterEach } from 'vitest'
import { createServer, Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { compareHeaders, verifyHeaders } from '../packages/core/utils/verify-headers'

const declared = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
}

describe('compareHeaders', () => {
  test('passes when every declared header is served exactly (names are case-insensitive)', () => {
    const served = {
      'content-security-policy': "default-src 'self'",
      'x-content-type-options': 'nosniff',
    }
    expect(compareHeaders(declared, served)).toEqual({ ok: true, missing: [], mismatched: [] })
  })

  // A host that serves every header except the CSP is the failure this exists to catch
  test('reports missing and differing headers', () => {
    const result = compareHeaders(declared, { 'x-content-type-options': 'sniff' })
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['Content-Security-Policy'])
    expect(result.mismatched).toEqual([
      { name: 'X-Content-Type-Options', expected: 'nosniff', actual: 'sniff' },
    ])
  })
})

describe('verifyHeaders against a live server', () => {
  let server: Server | undefined
  afterEach(() => server?.close())

  const serve = (headers: Record<string, string>) =>
    new Promise<string>(resolve => {
      server = createServer((_, res) => {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
        res.end('ok')
      }).listen(0, '127.0.0.1', () => {
        const address = server!.address() as { port: number }
        resolve(`http://127.0.0.1:${address.port}/`)
      })
    })

  const headersFile = () => {
    const dir = mkdtempSync(join(tmpdir(), 'commoners-verify-'))
    const file = join(dir, '_headers')
    writeFileSync(
      file,
      `/*\n  Content-Security-Policy: default-src 'self'\n  X-Content-Type-Options: nosniff\n`
    )
    return file
  }

  test('a server sending the declared headers passes', async () => {
    const url = await serve(declared)
    expect((await verifyHeaders(url, headersFile())).ok).toBe(true)
  })

  test('a server missing the CSP fails', async () => {
    const url = await serve({ 'X-Content-Type-Options': 'nosniff' })
    const result = await verifyHeaders(url, headersFile())
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['Content-Security-Policy'])
  })
})

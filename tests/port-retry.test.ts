import { describe, test, expect, afterEach } from 'vitest'
import { start, close } from '../packages/core/assets/services/index'
import { getFreePorts } from '../packages/core/assets/services/network'
import { createServer } from 'node:net'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Minimal HTTP server script that listens on PORT/HOST from env.
// Explicitly exits non-zero on EADDRINUSE so the retry logic can detect the conflict.
const SERVICE_SCRIPT = `
const http = require('node:http')
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ok')
})
server.on('error', (e) => { process.exit(1) })
server.listen(Number(process.env.PORT), process.env.HOST, () => {
  console.log('listening on ' + process.env.PORT)
})
`

const tmpDir = join(tmpdir(), 'commoners-port-retry-test')

// Write the service script once
mkdirSync(tmpDir, { recursive: true })
const scriptPath = join(tmpDir, 'echo-server.cjs')
writeFileSync(scriptPath, SERVICE_SCRIPT)

afterEach(async () => {
  await close() // Kill all spawned services
})

// Helper: occupy a port on 127.0.0.1 with a TCP server
function occupyPort(port: number): Promise<import('node:net').Server> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}

describe('Port retry logic', () => {
  // Use 127.0.0.1 (not localhost) in URLs to avoid IPv4/IPv6 mismatch on macOS
  // where localhost resolves to ::1 but the blocker listens on 127.0.0.1.

  test('retries on a new port when the original port is occupied', { timeout: 30000 }, async () => {
    // 1. Get a free port and occupy it
    const [occupiedPort] = await getFreePorts(1)
    const blocker = await occupyPort(occupiedPort)

    try {
      // 2. Build a pre-resolved config pointing at the occupied port
      const config = {
        __src: scriptPath,
        filepath: scriptPath,
        url: `http://127.0.0.1:${occupiedPort}`,
        __portAutoAllocated: true,
        status: null,
      }

      // 3. Start the service — it should detect the port conflict and retry
      const result = await start(config, 'port-retry-test', {
        root: tmpDir,
      })

      // 4. Verify the service started on a different port
      expect(result, 'Service should have started successfully').toBeTruthy()
      const resultUrl = new URL(result.url)
      expect(Number(resultUrl.port), 'Service should have moved to a different port').not.toBe(
        occupiedPort
      )

      // 5. Verify the service is actually reachable
      const res = await fetch(result.url)
      expect(res.ok).toBe(true)
      const body = await res.text()
      expect(body).toBe('ok')
    } finally {
      blocker.close()
    }
  })

  test('does not retry when port is user-specified', { timeout: 30000 }, async () => {
    // 1. Get a free port and occupy it
    const [occupiedPort] = await getFreePorts(1)
    const blocker = await occupyPort(occupiedPort)

    try {
      // 2. Build a config with __portAutoAllocated: false (user chose this port)
      const config = {
        __src: scriptPath,
        filepath: scriptPath,
        url: `http://127.0.0.1:${occupiedPort}`,
        __portAutoAllocated: false,
        status: null,
      }

      // 3. Start the service — it should fail without retrying
      const result = await start(config, 'port-noretry-test', {
        root: tmpDir,
      })

      // 4. Should return undefined (failed to start)
      expect(result).toBeUndefined()
    } finally {
      blocker.close()
    }
  })

  test('starts normally when port is available', { timeout: 30000 }, async () => {
    const [freePort] = await getFreePorts(1)

    const config = {
      __src: scriptPath,
      filepath: scriptPath,
      url: `http://127.0.0.1:${freePort}`,
      __portAutoAllocated: true,
      status: null,
    }

    const result = await start(config, 'port-ok-test', {
      root: tmpDir,
    })

    expect(result, 'Service should have started').toBeTruthy()
    const resultUrl = new URL(result.url)
    expect(Number(resultUrl.port)).toBe(freePort)

    const res = await fetch(result.url)
    expect(res.ok).toBe(true)
  })
})

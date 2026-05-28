import { describe, test, expect, afterEach, vi } from 'vitest'
import { start, close, verifyPortOwnership } from '../packages/core/assets/services/index'
import { getFreePorts } from '../packages/core/assets/services/network'
import { createServer } from 'node:net'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Minimal HTTP server script that listens on PORT/HOST from env
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

const tmpDir = join(tmpdir(), 'commoners-port-pid-test')
mkdirSync(tmpDir, { recursive: true })
const scriptPath = join(tmpDir, 'echo-server.cjs')
writeFileSync(scriptPath, SERVICE_SCRIPT)

afterEach(async () => {
  await close()
})

describe.skipIf(process.platform === 'win32')('verifyPortOwnership() unit tests', () => {
  test('returns match: true when expected PID owns the port', async () => {
    const [port] = await getFreePorts(1)

    // Start a TCP server — its PID is process.pid (the test process)
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })

    try {
      const result = verifyPortOwnership(String(port), process.pid)
      expect(result).not.toBeNull()
      expect(result!.match).toBe(true)
      expect(result!.pids).toContain(process.pid)
    } finally {
      server.close()
    }
  })

  test('returns match: false when a different PID owns the port', async () => {
    const [port] = await getFreePorts(1)

    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })

    try {
      const fakePid = 99999
      const result = verifyPortOwnership(String(port), fakePid)
      expect(result).not.toBeNull()
      expect(result!.match).toBe(false)
      expect(result!.pids).toContain(process.pid)
    } finally {
      server.close()
    }
  })

  test('returns null when nothing is listening on the port', async () => {
    const [port] = await getFreePorts(1)
    // Don't start any server — port is free
    const result = verifyPortOwnership(String(port), process.pid)
    expect(result).toBeNull()
  })
})

describe('Port PID verification via start()', () => {
  test(
    'no security:warning emitted when PID matches',
    { timeout: 30_000 },
    async () => {
      const [freePort] = await getFreePorts(1)

      const emitSpy = vi.fn()
      const hooks = { emit: emitSpy, on: vi.fn() }

      const config = {
        __src: scriptPath,
        filepath: scriptPath,
        url: `http://127.0.0.1:${freePort}`,
        __portAutoAllocated: true,
        status: null,
      }

      const result = await start(config, 'pid-match-test', {
        root: tmpDir,
        hooks,
      })

      expect(result, 'Service should have started').toBeTruthy()

      // Verify stdout was emitted (service started)
      const stdoutCalls = emitSpy.mock.calls.filter(
        ([evt]) => evt.type === 'service:stdout'
      )
      expect(stdoutCalls.length).toBeGreaterThan(0)

      // Verify no security warning was emitted
      const warningCalls = emitSpy.mock.calls.filter(
        ([evt]) => evt.type === 'security:warning'
      )
      expect(warningCalls).toHaveLength(0)
    }
  )
})

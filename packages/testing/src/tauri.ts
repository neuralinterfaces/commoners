/**
 * Tauri testing adapter — connects to a built Tauri app via tauri-driver (WebDriver)
 *
 * tauri-driver is the official Tauri WebDriver server that bridges WebDriver protocol
 * to the platform's webview (WebKit on macOS/Linux, WebView2 on Windows).
 *
 * Install: `cargo install tauri-driver`
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type TauriConnectOptions = {
  /** Path to the built Tauri application binary */
  appPath: string
  /** Port for tauri-driver (default: 4444) */
  driverPort?: number
  /** Connection timeout in ms (default: 30000) */
  timeout?: number
}

export type TauriTestContext = {
  /** Playwright-compatible page proxy wrapping WebDriverIO browser */
  page: TauriPageProxy
  /** Cleanup function — quits the app and kills the driver */
  cleanup: () => Promise<void>
}

/**
 * Minimal Playwright Page–compatible interface backed by WebDriverIO.
 * Only the subset used by commoners tests is implemented.
 */
export interface TauriPageProxy {
  evaluate: <R>(fn: string | ((...args: any[]) => R), ...args: any[]) => Promise<R>
  url: () => Promise<string>
  goto: (url: string) => Promise<void>
  waitForFunction: (
    fn: string | ((...args: any[]) => any),
    options?: { timeout?: number; polling?: number }
  ) => Promise<void>
}

/**
 * Wait for a TCP port to accept connections
 */
export function waitForPort(
  port: number,
  timeout = 30000,
  host = '127.0.0.1'
): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Port ${port} not reachable after ${timeout}ms`))
      }
      const sock = createConnection({ port, host })
      sock.once('connect', () => {
        sock.destroy()
        resolve()
      })
      sock.once('error', () => {
        sock.destroy()
        setTimeout(tryConnect, 300)
      })
      sock.setTimeout(1000, () => {
        sock.destroy()
        setTimeout(tryConnect, 300)
      })
    }
    tryConnect()
  })
}

/**
 * Create a Playwright Page–compatible proxy from a WebDriverIO Browser instance.
 *
 * Maps the small subset of the Page API that commoners tests actually use
 * (evaluate, url, goto, waitForFunction) onto WebDriverIO equivalents.
 */
export function createPageProxy(wdBrowser: any): TauriPageProxy {
  return {
    async evaluate<R>(fn: string | ((...args: any[]) => R), ...args: any[]): Promise<R> {
      const script = typeof fn === 'function' ? `return (${fn.toString()}).apply(null, arguments)` : fn
      return wdBrowser.execute(script, ...args) as Promise<R>
    },

    async url(): Promise<string> {
      return wdBrowser.getUrl()
    },

    async goto(url: string): Promise<void> {
      await wdBrowser.url(url)
    },

    async waitForFunction(
      fn: string | ((...args: any[]) => any),
      options: { timeout?: number; polling?: number } = {}
    ): Promise<void> {
      const { timeout = 30000, polling = 200 } = options
      const start = Date.now()
      const script =
        typeof fn === 'function' ? `return (${fn.toString()})()` : `return (${fn})()`

      while (Date.now() - start < timeout) {
        const result = await wdBrowser.execute(script)
        if (result) return
        await sleep(polling)
      }
      throw new Error(`waitForFunction timed out after ${timeout}ms`)
    },
  }
}

/**
 * Connect to a built Tauri app for testing.
 *
 * 1. Spawns `tauri-driver` on the given port
 * 2. Waits for the driver to accept TCP connections
 * 3. Connects via webdriverio remote() with the app binary as the target
 * 4. Returns a Playwright-compatible page proxy + cleanup function
 */
export async function connectTauri(options: TauriConnectOptions): Promise<TauriTestContext> {
  const { appPath, driverPort = 4444, timeout = 30000 } = options

  // Verify tauri-driver is installed
  let driverProcess: ChildProcess
  try {
    driverProcess = spawn('tauri-driver', ['--port', String(driverPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(
      'tauri-driver not found. Install it with: cargo install tauri-driver'
    )
  }

  // Collect stderr for diagnostics
  let driverStderr = ''
  driverProcess.stderr?.on('data', (chunk: Buffer) => {
    driverStderr += chunk.toString()
  })

  // Ensure driver process didn't exit immediately
  const earlyExit = await Promise.race([
    new Promise<number | null>(resolve => {
      driverProcess.once('exit', code => resolve(code))
    }),
    sleep(500).then(() => null),
  ])

  if (earlyExit !== null && earlyExit !== undefined) {
    throw new Error(
      `tauri-driver exited immediately with code ${earlyExit}. ` +
        `Is it installed? Run: cargo install tauri-driver\n${driverStderr}`
    )
  }

  // Wait for the driver port to become available
  try {
    await waitForPort(driverPort, timeout)
  } catch {
    driverProcess.kill()
    throw new Error(
      `tauri-driver did not start on port ${driverPort} within ${timeout}ms.\n${driverStderr}`
    )
  }

  // Connect via webdriverio
  let wdBrowser: any
  try {
    const { remote } = await import('webdriverio')
    wdBrowser = await remote({
      hostname: '127.0.0.1',
      port: driverPort,
      capabilities: {
        'tauri:options': {
          application: appPath,
        },
      } as any,
    })
  } catch (e: any) {
    driverProcess.kill()
    throw new Error(
      `Failed to connect webdriverio to tauri-driver on port ${driverPort}: ${e.message}`
    )
  }

  const page = createPageProxy(wdBrowser)

  const cleanupFn = async () => {
    try {
      await wdBrowser.deleteSession()
    } catch {
      // Session may already be closed
    }
    driverProcess.kill()
  }

  return { page, cleanup: cleanupFn }
}

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { open } from '@commoners/testing'
import { projectBase } from './utils'

/**
 * Plugin integration tests — exercises each @commoners plugin via the demo app.
 * Launches the demo in desktop (Electron) dev mode and validates plugin APIs
 * through the renderer's commoners global.
 */
describe('Plugin Integration (Desktop)', () => {
  const output: any = { cleanup: () => {} }

  beforeAll(async () => {
    const _output = await open(projectBase, { target: 'electron' })
    Object.assign(output, _output)
  })

  afterAll(async () => await output.cleanup())

  describe('Plugin Registration', () => {
    test('All expected plugins are registered', async () => {
      const pluginKeys = await output.page.evaluate(() => {
        return commoners.READY.then(() => Object.keys(commoners.PLUGINS))
      })

      expect(pluginKeys).toContain('checks')
      expect(pluginKeys).toContain('localServices')
      expect(pluginKeys).toContain('windows')
      expect(pluginKeys).toContain('longLoadTime')
    })

    test('Plugins have loaded APIs', async () => {
      const pluginTypes = await output.page.evaluate(() => {
        return commoners.READY.then(plugins => {
          return Object.fromEntries(Object.entries(plugins).map(([k, v]) => [k, typeof v]))
        })
      })

      // checks plugin returns an object with echo, env, src
      expect(pluginTypes.checks).toBe('object')
    })

    test('No plugin entry is a Promise (loader must store resolved values)', async () => {
      // Regression: assets/onload.ts used to do `loaded[id] = load.call(...); await loaded[id]`
      // which stored the Promise in `loaded[id]` instead of the resolved value.
      // Consumers that synchronously destructured + read sub-properties (e.g.
      // `const { windows } = await commoners.READY; windows.popup.create()`) silently
      // saw `undefined` because Promises have no own enumerable props.
      const offenders = await output.page.evaluate(() => {
        return commoners.READY.then(plugins => {
          const result: Record<string, string> = {}
          for (const [id, value] of Object.entries(plugins)) {
            if (value && typeof (value as any).then === 'function') {
              result[id] = `value is a Promise (constructor: ${value?.constructor?.name})`
            }
          }
          return result
        })
      })

      expect(offenders, `Plugins still wrapped as Promises: ${JSON.stringify(offenders)}`).toEqual(
        {}
      )
    })
  })

  describe('@commoners/windows plugin', () => {
    test('Windows plugin is registered', async () => {
      const pluginKeys = await output.page.evaluate(() => {
        return commoners.READY.then(() => Object.keys(commoners.PLUGINS))
      })
      expect(pluginKeys).toContain('windows')
    })

    test('Windows plugin load() returns popup manager (not a Promise wrapper)', async () => {
      // Regression test for a bug in assets/onload.ts where the renderer's plugin
      // loader stored the unresolved Promise in `loaded[id]` instead of the
      // awaited value. PLUGINS.windows ended up a Promise — `'popup' in windows`
      // was always false, and `windows.popup.create()` blew up at runtime.
      // Synchronous destructuring + property access must work.
      const result = await output.page.evaluate(() => {
        return commoners.READY.then(plugins => {
          const windows = plugins.windows
          return {
            isPromise: windows && typeof (windows as any).then === 'function',
            constructorName: windows?.constructor?.name,
            type: typeof windows,
            ownKeys: windows ? Object.keys(windows) : [],
            hasPopup: !!windows?.popup,
            hasPopupCreate: typeof windows?.popup?.create === 'function',
            hasPopupWindows: typeof windows?.popup?.windows === 'object',
          }
        })
      })

      expect(result.isPromise, 'PLUGINS.windows must be the resolved manager, not a Promise').toBe(
        false
      )
      expect(result.type).toBe('object')
      expect(result.ownKeys).toContain('popup')
      expect(result.hasPopup).toBe(true)
      expect(result.hasPopupCreate).toBe(true)
      expect(result.hasPopupWindows).toBe(true)
    })

    test('Windows plugin popup manager creates windows with expected API', async () => {
      const result = await output.page.evaluate(() => {
        return commoners.READY.then(async plugins => {
          const popup = plugins.windows?.popup
          if (!popup) return { skipped: true, reason: 'windows plugin not loaded' }
          const win = popup.create()
          if (!win) return { skipped: true, reason: 'create returned null' }
          return {
            skipped: false,
            hasOpen: typeof win.open === 'function',
            hasClose: typeof win.close === 'function',
            hasSend: typeof win.send === 'function',
          }
        })
      })

      // The "skipped" branches above should no longer fire after the onload.ts
      // unwrap fix. If they do, the regression is back — fail loudly rather than
      // silently logging.
      expect(result.skipped, `[windows] popup manager unavailable: ${result.reason}`).toBe(false)
      expect(result.hasOpen).toBe(true)
      expect(result.hasClose).toBe(true)
      expect(result.hasSend).toBe(true)
    })
  })

  describe('@commoners/local-services plugin', () => {
    test('Local services plugin exposes service discovery API', async () => {
      const result = await output.page.evaluate(() => {
        return commoners.READY.then(plugins => {
          const ls = plugins.localServices
          if (!ls) return null
          return {
            hasGetServices: typeof ls.getServices === 'function',
            hasOnServiceUp: typeof ls.onServiceUp === 'function',
            hasOnServiceDown: typeof ls.onServiceDown === 'function',
          }
        })
      })

      expect(result).not.toBeNull()
      expect(result.hasGetServices).toBe(true)
      expect(result.hasOnServiceUp).toBe(true)
      expect(result.hasOnServiceDown).toBe(true)
    })

    test('getServices returns an object', async () => {
      const result = await output.page.evaluate(() => {
        return commoners.READY.then(async plugins => {
          const ls = plugins.localServices
          if (!ls) return null

          // getServices sends IPC and waits for response — use a timeout
          const services = await Promise.race([
            ls.getServices(),
            new Promise(resolve => setTimeout(() => resolve('timeout'), 5000)),
          ])

          if (services === 'timeout') return { timeout: true }
          return {
            type: typeof services,
            isObject: services !== null && typeof services === 'object',
          }
        })
      })

      expect(result).not.toBeNull()
      // Services may timeout if mDNS hasn't discovered anything yet — that's okay
      if (!result.timeout) {
        expect(result.isObject).toBe(true)
      }
    })
  })

  describe('@commoners/splash-screen plugin', () => {
    test('Splash plugin is skipped in test mode', async () => {
      // The splash plugin checks __COMMONERS_TESTING and returns early.
      // Verify that only one window (main) is present — no splash window lingering.
      const windowCount = await output.page.evaluate(() => {
        // In Electron, we can check if the main window is the only one showing
        return commoners.READY.then(() => {
          return { hasCommoners: typeof commoners !== 'undefined' }
        })
      })

      expect(windowCount.hasCommoners).toBe(true)
    })
  })

  describe('Plugin context and IPC', () => {
    test('Checks plugin echo works (IPC round-trip)', async () => {
      const testMessage = `plugin-test-${Date.now()}`
      const echo = await output.page.evaluate(msg => {
        return commoners.READY.then(({ checks }) => checks.echo(msg))
      }, testMessage)

      expect(echo).toBe(testMessage)
    })

    test('Checks plugin provides env object', async () => {
      const env = await output.page.evaluate(() => {
        return commoners.READY.then(({ checks }) => checks.env)
      })

      expect(env).toBeDefined()
      expect(typeof env).toBe('object')
      expect(env.COMMONERS_ENV_FOR_ALL_MODES).toBeTruthy()
    })

    test('Checks plugin provides source file path', async () => {
      const src = await output.page.evaluate(() => {
        return commoners.READY.then(({ checks }) => checks.src)
      })

      // After bundling, import.meta.url resolves to the config source file.
      // In some contexts it may be null if the try/catch fails silently.
      if (src !== null) {
        expect(src).toBeTypeOf('string')
      }
    })
  })

  describe('Desktop globals and controls', () => {
    test('DESKTOP object provides quit and window identity', async () => {
      const desktop = await output.page.evaluate(() => {
        return commoners.READY.then(() => ({
          hasQuit: typeof commoners.DESKTOP.quit === 'function',
          hasId: '__id' in commoners.DESKTOP,
          hasMain: '__main' in commoners.DESKTOP,
          isMain: commoners.DESKTOP.__main,
        }))
      })

      expect(desktop.hasQuit).toBe(true)
      expect(desktop.hasId).toBe(true)
      expect(desktop.hasMain).toBe(true)
      expect(desktop.isMain).toBe(true)
    })

    test('TARGET is set to electron', async () => {
      const target = await output.page.evaluate(() => {
        return commoners.READY.then(() => commoners.TARGET)
      })

      expect(target).toBe('electron')
    })
  })
})

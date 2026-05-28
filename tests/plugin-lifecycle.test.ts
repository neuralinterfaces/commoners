import { describe, test, expect, vi } from 'vitest'
import { runAppPlugins } from '../packages/core/assets/plugins/index'
import { lazy } from '../packages/core/assets/utils/index'

/**
 * Unit tests for the plugin lifecycle system.
 * Tests runAppPlugins state transitions, error handling, and isSupported filtering.
 */

// Helper to create a mock context for runAppPlugins
function createMockContext(plugins: Record<string, any>, envOverrides = {}) {
  const env = {
    DESKTOP: true,
    MOBILE: false,
    WEB: false,
    TARGET: 'electron',
    DEV: true,
    ...envOverrides,
  }

  const contexts: Record<string, any> = {}
  for (const id of Object.keys(plugins)) {
    contexts[id] = { pluginId: id }
  }

  return { plugins, env, contexts }
}

describe('Plugin Lifecycle (runAppPlugins)', () => {
  describe('State transitions', () => {
    test('start sets __state to "start"', async () => {
      const startFn = vi.fn()
      const plugin = { start: startFn }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')

      expect(plugin.__state).toBe('start')
      expect(startFn).toHaveBeenCalledOnce()
    })

    test('ready only runs after start', async () => {
      const readyFn = vi.fn()
      const plugin = { ready: readyFn, __state: 'start' }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'ready')

      expect(plugin.__state).toBe('ready')
      expect(readyFn).toHaveBeenCalledOnce()
    })

    test('ready does NOT run if start was not called', async () => {
      const readyFn = vi.fn()
      const plugin = { ready: readyFn }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'ready')

      expect(readyFn).not.toHaveBeenCalled()
    })

    test('start only runs once (idempotent)', async () => {
      const startFn = vi.fn()
      const plugin = { start: startFn }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')
      await runAppPlugins.call(ctx, [], 'start')

      expect(startFn).toHaveBeenCalledOnce()
    })

    test('quit sets __state to "quit"', async () => {
      const quitFn = vi.fn()
      const plugin = { quit: quitFn, __state: 'ready' }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'quit')

      expect(plugin.__state).toBe('quit')
      expect(quitFn).toHaveBeenCalledOnce()
    })

    test('Full lifecycle: start → ready → quit', async () => {
      const order: string[] = []
      const plugin = {
        start: vi.fn(() => order.push('start')),
        ready: vi.fn(() => order.push('ready')),
        quit: vi.fn(() => order.push('quit')),
      }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')
      await runAppPlugins.call(ctx, [], 'ready')
      await runAppPlugins.call(ctx, [], 'quit')

      expect(order).toEqual(['start', 'ready', 'quit'])
    })
  })

  describe('Multiple plugins', () => {
    test('start() hooks run concurrently for all plugins', async () => {
      const startA = vi.fn()
      const startB = vi.fn()
      const ctx = createMockContext({
        pluginA: { start: startA },
        pluginB: { start: startB },
      })

      await runAppPlugins.call(ctx, [], 'start')

      expect(startA).toHaveBeenCalledOnce()
      expect(startB).toHaveBeenCalledOnce()
    })

    test('Arguments are passed to plugin hooks', async () => {
      const startFn = vi.fn()
      const ctx = createMockContext({ testPlugin: { start: startFn } })
      const services = { http: { url: 'http://localhost:3000' } }

      await runAppPlugins.call(ctx, [services], 'start')

      expect(startFn).toHaveBeenCalledWith(services, 'testPlugin')
    })

    test('ready() hooks run sequentially (not concurrently)', async () => {
      const order: string[] = []
      const readyA = vi.fn(async () => {
        order.push('A-start')
        await new Promise(resolve => setTimeout(resolve, 50))
        order.push('A-end')
      })
      const readyB = vi.fn(async () => {
        order.push('B-start')
        await new Promise(resolve => setTimeout(resolve, 10))
        order.push('B-end')
      })
      const ctx = createMockContext({
        pluginA: { ready: readyA, __state: 'start' },
        pluginB: { ready: readyB, __state: 'start' },
      })

      await runAppPlugins.call(ctx, [], 'ready')

      // Sequential: A must fully complete before B starts
      expect(order).toEqual(['A-start', 'A-end', 'B-start', 'B-end'])
    })

    test('Plugin hooks receive correct context via this', async () => {
      let receivedContext: any = null
      const startFn = vi.fn(function (this: any) {
        receivedContext = this // eslint-disable-line @typescript-eslint/no-this-alias
      })
      const ctx = createMockContext({ testPlugin: { start: startFn } })

      await runAppPlugins.call(ctx, [], 'start')

      expect(receivedContext).toBe(ctx.contexts.testPlugin)
    })
  })

  describe('isSupported filtering', () => {
    test('Plugin with isSupported function is checked', async () => {
      const startFn = vi.fn()
      const plugin = {
        start: startFn,
        isSupported: { start: ({ DESKTOP }) => DESKTOP },
      }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')
      expect(startFn).toHaveBeenCalledOnce()
    })

    test('Plugin excluded by isSupported does not run', async () => {
      const startFn = vi.fn()
      const plugin = {
        start: startFn,
        isSupported: { start: ({ DESKTOP }) => !DESKTOP }, // Only on non-desktop
      }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')
      expect(startFn).not.toHaveBeenCalled()
    })

    test('isSupported as simple function applies to all hooks', async () => {
      const startFn = vi.fn()
      const plugin = {
        start: startFn,
        isSupported: ({ DEV }) => DEV,
      }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')
      expect(startFn).toHaveBeenCalledOnce()
    })

    test('isSupported false in prod mode prevents start', async () => {
      const startFn = vi.fn()
      const plugin = {
        start: startFn,
        isSupported: ({ DEV }) => DEV,
      }
      const ctx = createMockContext({ testPlugin: plugin }, { DEV: false })

      await runAppPlugins.call(ctx, [], 'start')
      expect(startFn).not.toHaveBeenCalled()
    })
  })

  describe('Error isolation', () => {
    test('One plugin error does NOT prevent other plugins from running', async () => {
      const startA = vi.fn(() => {
        throw new Error('Plugin A failed')
      })
      const startB = vi.fn()
      const ctx = createMockContext({
        pluginA: { start: startA },
        pluginB: { start: startB },
      })

      // Should not reject — errors are caught per-plugin
      await expect(runAppPlugins.call(ctx, [], 'start')).resolves.toBeDefined()
      expect(startA).toHaveBeenCalledOnce()
      expect(startB).toHaveBeenCalledOnce()
    })

    test('Async plugin error is caught and does not propagate', async () => {
      const startFn = vi.fn(async () => {
        throw new Error('Async failure')
      })
      const startB = vi.fn()
      const ctx = createMockContext({
        failing: { start: startFn },
        working: { start: startB },
      })

      await expect(runAppPlugins.call(ctx, [], 'start')).resolves.toBeDefined()
      expect(startB).toHaveBeenCalledOnce()
    })

    test('Error in ready() does not block other plugins from becoming ready', async () => {
      const readyA = vi.fn(async () => {
        throw new Error('Ready A failed')
      })
      const readyB = vi.fn()
      const ctx = createMockContext({
        pluginA: { ready: readyA, __state: 'start' },
        pluginB: { ready: readyB, __state: 'start' },
      })

      await expect(runAppPlugins.call(ctx, [], 'ready')).resolves.toBeDefined()
      expect(readyA).toHaveBeenCalledOnce()
      expect(readyB).toHaveBeenCalledOnce()
    })
  })

  describe('Lazy factory resolution', () => {
    test('Lazy plugin hooks are resolved and cached', async () => {
      const actualStart = vi.fn()
      // Use the lazy() marker so resolveLazy recognizes it as a lazy factory
      const lazyFactory = lazy(() => Promise.resolve(actualStart))
      const plugin = { start: lazyFactory }
      const ctx = createMockContext({ testPlugin: plugin })

      await runAppPlugins.call(ctx, [], 'start')

      // After resolution, the lazy factory should be replaced with the actual function
      expect(actualStart).toHaveBeenCalledOnce()
      // And the plugin.start should now be the resolved function (cached)
      expect(plugin.start).toBe(actualStart)
    })
  })

  describe('Plugin without hooks', () => {
    test('Plugin with no start hook is skipped gracefully', async () => {
      const plugin = { ready: vi.fn() }
      const ctx = createMockContext({ testPlugin: plugin })

      // Should not throw
      await runAppPlugins.call(ctx, [], 'start')
      expect(plugin.__state).toBe('start')
    })

    test('Empty plugins object runs without error', async () => {
      const ctx = createMockContext({})
      await expect(runAppPlugins.call(ctx, [], 'start')).resolves.toEqual([])
    })
  })

  describe('after dependency ordering', () => {
    test('Plugin with after runs after its dependency', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        pluginA: { ready: vi.fn(() => order.push('A')), __state: 'start' },
        pluginB: { ready: vi.fn(() => order.push('B')), __state: 'start', after: ['pluginA'] },
      })

      await runAppPlugins.call(ctx, [], 'ready')
      expect(order).toEqual(['A', 'B'])
    })

    test('after reverses natural order when needed', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        // B is listed first in config but declares after: ['A']
        pluginB: { ready: vi.fn(() => order.push('B')), __state: 'start', after: ['pluginA'] },
        pluginA: { ready: vi.fn(() => order.push('A')), __state: 'start' },
      })

      await runAppPlugins.call(ctx, [], 'ready')
      expect(order).toEqual(['A', 'B'])
    })

    test('Multiple after dependencies are respected', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        pluginC: {
          ready: vi.fn(() => order.push('C')),
          __state: 'start',
          after: ['pluginA', 'pluginB'],
        },
        pluginA: { ready: vi.fn(() => order.push('A')), __state: 'start' },
        pluginB: { ready: vi.fn(() => order.push('B')), __state: 'start' },
      })

      await runAppPlugins.call(ctx, [], 'ready')
      // A and B must both run before C
      expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('A'))
      expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('B'))
    })

    test('Plugins without after preserve original order', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        pluginA: { ready: vi.fn(() => order.push('A')), __state: 'start' },
        pluginB: { ready: vi.fn(() => order.push('B')), __state: 'start' },
        pluginC: { ready: vi.fn(() => order.push('C')), __state: 'start' },
      })

      await runAppPlugins.call(ctx, [], 'ready')
      expect(order).toEqual(['A', 'B', 'C'])
    })

    test('after referencing non-existent plugin is ignored', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        pluginA: {
          ready: vi.fn(() => order.push('A')),
          __state: 'start',
          after: ['nonExistent'],
        },
        pluginB: { ready: vi.fn(() => order.push('B')), __state: 'start' },
      })

      await runAppPlugins.call(ctx, [], 'ready')
      // Should run fine, original order preserved
      expect(order).toEqual(['A', 'B'])
    })

    test('Circular after dependencies are detected and plugins still run', async () => {
      const order: string[] = []
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const ctx = createMockContext({
        pluginA: {
          ready: vi.fn(() => order.push('A')),
          __state: 'start',
          after: ['pluginB'],
        },
        pluginB: {
          ready: vi.fn(() => order.push('B')),
          __state: 'start',
          after: ['pluginA'],
        },
      })

      await runAppPlugins.call(ctx, [], 'ready')

      // Both plugins should still run despite circular dependency
      expect(order).toContain('A')
      expect(order).toContain('B')
      // Warning should be logged
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    test('after only affects ready() hooks, not start()', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        pluginB: { start: vi.fn(() => order.push('B')), after: ['pluginA'] },
        pluginA: { start: vi.fn(() => order.push('A')) },
      })

      await runAppPlugins.call(ctx, [], 'start')
      // start() runs concurrently via Promise.all — after has no effect
      // Both should run (order may vary due to concurrency)
      expect(order).toContain('A')
      expect(order).toContain('B')
    })

    test('Chained dependencies: A -> B -> C', async () => {
      const order: string[] = []
      const ctx = createMockContext({
        pluginC: {
          ready: vi.fn(() => order.push('C')),
          __state: 'start',
          after: ['pluginB'],
        },
        pluginB: {
          ready: vi.fn(() => order.push('B')),
          __state: 'start',
          after: ['pluginA'],
        },
        pluginA: { ready: vi.fn(() => order.push('A')), __state: 'start' },
      })

      await runAppPlugins.call(ctx, [], 'ready')
      expect(order).toEqual(['A', 'B', 'C'])
    })
  })
})

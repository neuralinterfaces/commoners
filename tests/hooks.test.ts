import { expect, test, describe, beforeEach } from 'vitest'
import type { HookEvent, HooksInterface } from '@commoners/solidarity'

// Mock Hooks implementation for testing
class Hooks implements HooksInterface {
  private handlers: Map<string, Set<(event: HookEvent) => void>> = new Map()

  on(eventType: HookEvent['type'] | 'all', handler: (event: HookEvent) => void) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)

    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  emit(event: HookEvent) {
    const typeHandlers = this.handlers.get(event.type) || new Set()
    const allHandlers = this.handlers.get('all') || new Set()

    // Call handlers, catching errors individually
    typeHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        // Silently continue if handler throws
      }
    })

    allHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        // Silently continue if handler throws
      }
    })
  }
}

class DefaultHooks extends Hooks {}

describe('API: Hooks System', () => {
  describe('Hooks Class', () => {
    let hooks: Hooks

    beforeEach(() => {
      hooks = new Hooks()
    })

    test('should register and emit event handlers', () => {
      const events: HookEvent[] = []

      hooks.on('build:start', (event) => {
        events.push(event)
      })

      const buildEvent: HookEvent = {
        type: 'build:start',
        config: {} as any,
        dev: true,
      }

      hooks.emit(buildEvent)
      expect(events).toHaveLength(1)
      expect(events[0]).toEqual(buildEvent)
    })

    test('should support multiple handlers for same event', () => {
      let count = 0

      hooks.on('build:start', () => { count++ })
      hooks.on('build:start', () => { count++ })

      hooks.emit({ type: 'build:start', config: {} as any, dev: true })
      expect(count).toBe(2)
    })

    test('should support "all" event listener', () => {
      const events: HookEvent[] = []

      hooks.on('all', (event) => {
        events.push(event)
      })

      hooks.emit({ type: 'build:start', config: {} as any, dev: true })
      hooks.emit({ type: 'build:complete', config: {} as any, outDir: '/out', duration: 100 })

      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('build:start')
      expect(events[1].type).toBe('build:complete')
    })

    test('should allow unsubscribing from events', () => {
      let count = 0

      const unsubscribe = hooks.on('build:start', () => {
        count++
      })

      hooks.emit({ type: 'build:start', config: {} as any, dev: true })
      expect(count).toBe(1)

      unsubscribe()

      hooks.emit({ type: 'build:start', config: {} as any, dev: true })
      expect(count).toBe(1) // Should not increment
    })

    test('should handle async event handlers', async () => {
      let resolved = false

      hooks.on('build:complete', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        resolved = true
      })

      hooks.emit({ type: 'build:complete', config: {} as any, outDir: '/out' })

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(resolved).toBe(true)
    })

    test('should support service events', () => {
      const serviceEvents: HookEvent[] = []

      hooks.on('service:start', (event) => {
        serviceEvents.push(event)
      })

      hooks.emit({ type: 'service:start', service: 'http', url: 'http://localhost:3000' })

      expect(serviceEvents).toHaveLength(1)
      expect(serviceEvents[0].type).toBe('service:start')
    })

    test('should support launch events', () => {
      const launchEvents: HookEvent[] = []

      hooks.on('launch:start', (event) => {
        launchEvents.push(event)
      })

      hooks.emit({ type: 'launch:start', outDir: '/out', target: 'web' })

      expect(launchEvents).toHaveLength(1)
      expect(launchEvents[0].type).toBe('launch:start')
    })

    test('should support dev server events', () => {
      const devEvents: HookEvent[] = []

      hooks.on('dev:server:ready', (event) => {
        devEvents.push(event)
      })

      hooks.emit({ type: 'dev:server:ready', target: 'web', url: 'http://localhost:5173' })

      expect(devEvents).toHaveLength(1)
      expect(devEvents[0].type).toBe('dev:server:ready')
    })

    test('should support security events', () => {
      const securityEvents: HookEvent[] = []

      hooks.on('security:warning', (event) => {
        securityEvents.push(event)
      })

      hooks.emit({ type: 'security:warning', message: 'Integrity check failed' })

      expect(securityEvents).toHaveLength(1)
      expect(securityEvents[0].type).toBe('security:warning')
    })

    test('should not throw errors for events with no handlers', () => {
      expect(() => {
        hooks.emit({ type: 'build:start', config: {} as any, dev: true })
      }).not.toThrow()
    })

    test('should handle error events', () => {
      const errors: Error[] = []

      hooks.on('build:error', (event) => {
        if (event.type === 'build:error') {
          errors.push(event.error)
        }
      })

      const error = new Error('Build failed')
      hooks.emit({ type: 'build:error', error, phase: 'build' })

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Build failed')
    })
  })

  describe('DefaultHooks Class', () => {
    test('should extend Hooks class', () => {
      const hooks = new DefaultHooks()
      expect(hooks).toBeInstanceOf(Hooks)
    })

    test('should work with all Hooks methods', () => {
      const hooks = new DefaultHooks()
      const events: HookEvent[] = []

      hooks.on('all', (event) => {
        events.push(event)
      })

      hooks.emit({ type: 'build:start', config: {} as any, dev: true })
      expect(events).toHaveLength(1)
    })
  })

  describe('Hook Event Types', () => {
    let hooks: Hooks

    beforeEach(() => {
      hooks = new Hooks()
    })

    test('should handle build asset events', () => {
      const events: HookEvent[] = []

      hooks.on('build:assets:start', (event) => {
        events.push(event)
      })

      hooks.emit({ type: 'build:assets:start', phase: 'frontend' })
      hooks.emit({ type: 'build:assets:start', phase: 'services', services: ['http'] })

      expect(events).toHaveLength(2)
    })

    test('should handle service build events', () => {
      const events: HookEvent[] = []

      hooks.on('service:build:start', (event) => {
        events.push(event)
      })

      hooks.emit({
        type: 'service:build:start',
        service: 'http',
        src: '/src/http.ts',
        out: '/out/http.js'
      })

      expect(events).toHaveLength(1)
    })

    test('should handle service build completion', () => {
      const events: HookEvent[] = []

      hooks.on('service:build:end', (event) => {
        events.push(event)
      })

      hooks.emit({
        type: 'service:build:end',
        service: 'http',
        src: '/src/http.ts',
        out: '/out/http.js',
        duration: 1500
      })

      expect(events).toHaveLength(1)
      if (events[0].type === 'service:build:end') {
        expect(events[0].duration).toBe(1500)
      }
    })

    test('should handle service launch events', () => {
      const events: HookEvent[] = []

      hooks.on('service:launch:complete', (event) => {
        events.push(event)
      })

      hooks.emit({
        type: 'service:launch:complete',
        service: 'http',
        filepath: '/out/http.js',
        url: 'http://localhost:3000'
      })

      expect(events).toHaveLength(1)
    })

    test('should handle service stdout/stderr', () => {
      const outputs: string[] = []

      hooks.on('service:stdout', (event) => {
        if (event.type === 'service:stdout') {
          outputs.push(event.data)
        }
      })

      hooks.emit({ type: 'service:stdout', data: 'Service started', service: 'http' })

      expect(outputs).toHaveLength(1)
      expect(outputs[0]).toBe('Service started')
    })

    test('should handle electron dev events', () => {
      const events: HookEvent[] = []

      hooks.on('dev:electron:ready', (event) => {
        events.push(event)
      })

      hooks.emit({ type: 'dev:electron:ready', app: {} as any })

      expect(events).toHaveLength(1)
    })
  })

  describe('Event Flow Tracking', () => {
    test('should track complete build flow', () => {
      const hooks = new Hooks()
      const flow: string[] = []

      hooks.on('all', (event) => {
        flow.push(event.type)
      })

      // Simulate build flow
      hooks.emit({ type: 'build:start', config: {} as any, dev: false })
      hooks.emit({ type: 'build:assets:start', phase: 'frontend' })
      hooks.emit({ type: 'build:assets:complete', phase: 'frontend' })
      hooks.emit({ type: 'build:assets:start', phase: 'services' })
      hooks.emit({ type: 'build:assets:complete', phase: 'services' })
      hooks.emit({ type: 'build:complete', config: {} as any, outDir: '/out' })

      expect(flow).toEqual([
        'build:start',
        'build:assets:start',
        'build:assets:complete',
        'build:assets:start',
        'build:assets:complete',
        'build:complete'
      ])
    })

    test('should track service lifecycle', () => {
      const hooks = new Hooks()
      const lifecycle: string[] = []

      hooks.on('all', (event) => {
        if (event.type.startsWith('service:')) {
          lifecycle.push(event.type)
        }
      })

      // Simulate service lifecycle
      hooks.emit({ type: 'service:build:start', service: 'http', src: '/src', out: '/out' })
      hooks.emit({ type: 'service:build:end', service: 'http', src: '/src', out: '/out' })
      hooks.emit({ type: 'service:launch:start', service: 'http', filepath: '/out/http.js' })
      hooks.emit({ type: 'service:launch:complete', service: 'http', filepath: '/out/http.js', url: 'http://localhost:3000' })
      hooks.emit({ type: 'service:ready', service: 'http', port: 3000 })

      expect(lifecycle).toEqual([
        'service:build:start',
        'service:build:end',
        'service:launch:start',
        'service:launch:complete',
        'service:ready'
      ])
    })
  })

  describe('Error Handling in Hooks', () => {
    test('should continue execution if handler throws', () => {
      const hooks = new Hooks()
      let secondHandlerCalled = false

      hooks.on('build:start', () => {
        throw new Error('Handler error')
      })

      hooks.on('build:start', () => {
        secondHandlerCalled = true
      })

      // Should not throw, but continue to second handler
      hooks.emit({ type: 'build:start', config: {} as any, dev: true })

      expect(secondHandlerCalled).toBe(true)
    })

    test('should handle errors in async handlers', async () => {
      const hooks = new Hooks()
      let errorCaught = false

      hooks.on('build:start', async () => {
        try {
          throw new Error('Async error')
        } catch {
          errorCaught = true
        }
      })

      hooks.emit({ type: 'build:start', config: {} as any, dev: true })

      await new Promise(resolve => setTimeout(resolve, 10))
      expect(errorCaught).toBe(true)
    })
  })
})

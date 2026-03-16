import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServiceHealthMonitor } from '../packages/core/assets/services/health'
import type { HooksInterface } from '../packages/core/types'

function createMockHooks(): HooksInterface & { events: any[] } {
  const events: any[] = []
  return {
    events,
    emit: (event: any) => { events.push(event) },
    on: () => () => {},
  }
}

describe('ServiceHealthMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('initial status is unknown', () => {
    const hooks = createMockHooks()
    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {}, hooks)
    expect(monitor.getStatus()).toBe('unknown')
  })

  test('becomes healthy after successful fetch', async () => {
    const hooks = createMockHooks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', { interval: 1000 }, hooks)
    monitor.start()

    // Wait for initial check to complete
    await vi.advanceTimersByTimeAsync(0)

    expect(monitor.getStatus()).toBe('healthy')
    expect(hooks.events).toContainEqual(expect.objectContaining({ type: 'service:ready', service: 'test' }))

    monitor.stop()
  })

  test('becomes unhealthy after consecutive failures', async () => {
    const hooks = createMockHooks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {
      interval: 100,
      retries: 3,
    }, hooks)
    monitor.start()

    // Initial check (failure 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(monitor.getStatus()).toBe('unknown')

    // Failure 2
    await vi.advanceTimersByTimeAsync(100)
    expect(monitor.getStatus()).toBe('unknown')

    // Failure 3 — should become unhealthy
    await vi.advanceTimersByTimeAsync(100)
    expect(monitor.getStatus()).toBe('unhealthy')
    expect(hooks.events).toContainEqual(expect.objectContaining({ type: 'service:error', service: 'test' }))

    monitor.stop()
  })

  test('resets failure count on success', async () => {
    const hooks = createMockHooks()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {
      interval: 100,
      retries: 3,
    }, hooks)
    monitor.start()

    // Two failures
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(monitor.getStatus()).toBe('unknown')

    // Success resets
    await vi.advanceTimersByTimeAsync(100)
    expect(monitor.getStatus()).toBe('healthy')

    monitor.stop()
  })

  test('calls onRestart when autoRestart is enabled', async () => {
    const hooks = createMockHooks()
    const onRestart = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {
      interval: 100,
      retries: 2,
      autoRestart: true,
    }, hooks, onRestart)
    monitor.start()

    // Failure 1
    await vi.advanceTimersByTimeAsync(0)
    // Failure 2 — triggers restart
    await vi.advanceTimersByTimeAsync(100)

    expect(monitor.getStatus()).toBe('restarting')
    expect(onRestart).toHaveBeenCalledOnce()
    expect(hooks.events).toContainEqual(expect.objectContaining({ type: 'service:restart', service: 'test' }))

    monitor.stop()
  })

  test('does not restart when autoRestart is false', async () => {
    const hooks = createMockHooks()
    const onRestart = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {
      interval: 100,
      retries: 2,
      autoRestart: false,
    }, hooks, onRestart)
    monitor.start()

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)

    expect(monitor.getStatus()).toBe('unhealthy')
    expect(onRestart).not.toHaveBeenCalled()

    monitor.stop()
  })

  test('stop sets status to stopped and clears timer', async () => {
    const hooks = createMockHooks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {}, hooks)
    monitor.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(monitor.getStatus()).toBe('healthy')
    monitor.stop()
    expect(monitor.getStatus()).toBe('stopped')
  })

  test('treats 4xx responses as healthy (client error, service is up)', async () => {
    const hooks = createMockHooks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', { interval: 1000 }, hooks)
    monitor.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(monitor.getStatus()).toBe('healthy')
    monitor.stop()
  })

  test('treats 5xx responses as failures', async () => {
    const hooks = createMockHooks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {
      interval: 100,
      retries: 1,
    }, hooks)
    monitor.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(monitor.getStatus()).toBe('unhealthy')

    monitor.stop()
  })

  test('uses default config values', () => {
    const hooks = createMockHooks()
    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', {}, hooks)

    // Can't directly inspect config, but we can verify the monitor starts without errors
    monitor.start()
    monitor.stop()
    expect(monitor.getStatus()).toBe('stopped')
  })

  test('start is idempotent (calling twice does not create duplicate timers)', async () => {
    const hooks = createMockHooks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    const monitor = new ServiceHealthMonitor('test', 'http://localhost:3000', { interval: 1000 }, hooks)
    monitor.start()
    monitor.start() // second call should be no-op

    await vi.advanceTimersByTimeAsync(0)
    expect(monitor.getStatus()).toBe('healthy')

    // Only one service:ready event (not two)
    const readyEvents = hooks.events.filter(e => e.type === 'service:ready')
    expect(readyEvents).toHaveLength(1)

    monitor.stop()
  })
})

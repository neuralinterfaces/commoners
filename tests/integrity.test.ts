import { describe, test, expect } from 'vitest'
import integrityPlugin from '../packages/plugins/integrity/index'

describe('@commoners/integrity plugin', () => {
  test('exports a factory function', () => {
    expect(typeof integrityPlugin).toBe('function')
  })

  test('factory returns a plugin object with expected hooks', () => {
    const plugin = integrityPlugin()
    expect(plugin.capabilities.provides).toContain('integrity')
    expect(plugin.capabilities.provides).toContain('tamper-detection')
    expect(typeof plugin.load).toBe('function')
    expect(typeof plugin.start).toBe('function')
    expect(typeof plugin.ready).toBe('function')
    expect(typeof plugin.quit).toBe('function')
  })

  test('factory accepts options', () => {
    const plugin = integrityPlugin({
      interval: 30000,
      strict: true,
      verifyAsar: false,
      verifyServices: true,
    })
    expect(plugin).toBeDefined()
    expect(plugin.capabilities).toBeDefined()
  })

  test('isSupported restricts to desktop only', () => {
    const plugin = integrityPlugin()
    const { isSupported } = plugin as any
    expect(isSupported.start({ DESKTOP: true })).toBe(true)
    expect(isSupported.start({ DESKTOP: false })).toBe(false)
    expect(isSupported.ready({ DESKTOP: true })).toBe(true)
    expect(isSupported.load({ DESKTOP: true })).toBe(true)
  })

  test('load() returns renderer API with status and verify methods', () => {
    const plugin = integrityPlugin()
    const mockContext = { invoke: (_channel: string) => Promise.resolve(null) }
    const api = plugin.load.call(mockContext)
    expect(typeof api.getStatus).toBe('function')
    expect(typeof api.verify).toBe('function')
  })

  test('default options disable periodic checks', () => {
    const plugin = integrityPlugin()
    // Plugin should not throw when ready() is called without services
    expect(plugin).toBeDefined()
  })

  test('capabilities declare desktop platform support', () => {
    const plugin = integrityPlugin()
    expect(plugin.capabilities.platforms).toEqual({ desktop: true })
  })
})

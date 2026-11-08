import { describe, test, expect, vi } from 'vitest'

// The generated Tauri app picks each sidecar's port at launch and reports it through the
// commoners_get_services command. The page must expose those URLs, not the build-time ones.
const invoke = vi.fn(async (command: string) => {
  if (command === 'commoners_get_services')
    return { api: { url: 'http://localhost:62877', status: true } }
  throw new Error(`unexpected command ${command}`)
})
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

describe('Tauri runtime service URLs', () => {
  test('SERVICES carries the runtime port before READY resolves', async () => {
    let urlAtReady: string | undefined
    const g = globalThis as any
    Object.assign(g, {
      __HAS_PLUGINS__: false,
      __IS_DEV__: false,
      __IS_DESKTOP__: false,
      __IS_TAURI__: true,
      commoners: {
        TARGET: 'tauri',
        DESKTOP: true,
        SERVICES: {
          api: { url: 'http://localhost:62332/' }, // Build-time port
          remote: { url: 'https://example.com/api' }, // Not a sidecar: left alone
        },
        __READY: () => (urlAtReady = g.commoners.SERVICES.api.url),
      },
    })

    await import('../packages/core/assets/onload')
    await vi.waitFor(() => expect(urlAtReady).toBeDefined())

    expect(invoke).toHaveBeenCalledWith('commoners_get_services')
    expect(urlAtReady).toBe('http://localhost:62877/')
    expect(g.commoners.SERVICES.remote.url).toBe('https://example.com/api')
    expect(Object.keys(g.commoners.SERVICES.api)).toEqual(['url']) // Same public shape
  })
})

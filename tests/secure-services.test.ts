import { describe, test, expect, afterEach } from 'vitest'
import secureServicesPlugin, {
  createTokenValidator,
  validateToken,
  TOKEN_ENV_VAR,
  SESSION_ENV_VAR,
  TOKEN_HEADER,
} from '../packages/plugins/secure-services/index'

describe('@commoners/secure-services plugin', () => {
  test('exports a factory function', () => {
    expect(typeof secureServicesPlugin).toBe('function')
  })

  test('factory returns plugin with expected hooks', () => {
    const plugin = secureServicesPlugin()
    expect(plugin.capabilities.provides).toContain('secure-services')
    expect(plugin.capabilities.provides).toContain('service-auth')
    expect(typeof plugin.load).toBe('function')
    expect(typeof plugin.start).toBe('function')
    expect(typeof plugin.ready).toBe('function')
    expect(typeof plugin.quit).toBe('function')
  })

  test('isSupported restricts to desktop only', () => {
    const plugin = secureServicesPlugin() as any
    expect(plugin.isSupported.start({ DESKTOP: true })).toBe(true)
    expect(plugin.isSupported.start({ DESKTOP: false })).toBe(false)
  })

  test('load() returns renderer API', () => {
    const plugin = secureServicesPlugin()
    const mockCtx = { invoke: (_ch: string) => Promise.resolve(null) }
    const api = plugin.load.call(mockCtx)
    expect(typeof api.getSessionId).toBe('function')
    expect(typeof api.isActive).toBe('function')
    expect(api.headerName).toBe(TOKEN_HEADER)
  })

  test('factory accepts options', () => {
    const plugin = secureServicesPlugin({
      tokenLength: 64,
      refreshInterval: 30000,
      emitEvents: false,
    })
    expect(plugin).toBeDefined()
  })
})

describe('Token lifecycle', () => {
  afterEach(() => {
    delete process.env[TOKEN_ENV_VAR]
    delete process.env[SESSION_ENV_VAR]
  })

  test('start() generates token and injects into process.env', async () => {
    const plugin = secureServicesPlugin({ emitEvents: false })
    const mockCtx = {
      handle: () => {},
      hooks: { emit: () => {} },
    }
    await plugin.start.call(mockCtx, {})

    expect(process.env[TOKEN_ENV_VAR]).toBeTruthy()
    expect(process.env[TOKEN_ENV_VAR]!.length).toBe(64) // 32 bytes = 64 hex
    expect(process.env[SESSION_ENV_VAR]).toBeTruthy()
    expect(process.env[SESSION_ENV_VAR]!.length).toBe(36) // UUID format
  })

  test('quit() clears token from process.env', async () => {
    const plugin = secureServicesPlugin({ emitEvents: false })
    const mockCtx = {
      handle: () => {},
      hooks: { emit: () => {} },
    }
    await plugin.start.call(mockCtx, {})
    expect(process.env[TOKEN_ENV_VAR]).toBeTruthy()

    await plugin.quit.call(mockCtx)
    expect(process.env[TOKEN_ENV_VAR]).toBeUndefined()
    expect(process.env[SESSION_ENV_VAR]).toBeUndefined()
  })

  test('custom tokenLength produces expected hex length', async () => {
    const plugin = secureServicesPlugin({ tokenLength: 16, emitEvents: false })
    const mockCtx = {
      handle: () => {},
      hooks: { emit: () => {} },
    }
    await plugin.start.call(mockCtx, {})
    expect(process.env[TOKEN_ENV_VAR]!.length).toBe(32) // 16 bytes = 32 hex
  })
})

describe('Token validation utilities', () => {
  afterEach(() => {
    delete process.env[TOKEN_ENV_VAR]
  })

  test('validateToken returns true for matching token', () => {
    process.env[TOKEN_ENV_VAR] = 'test-token-123'
    expect(validateToken('test-token-123')).toBe(true)
  })

  test('validateToken returns false for wrong token', () => {
    process.env[TOKEN_ENV_VAR] = 'test-token-123'
    expect(validateToken('wrong-token')).toBe(false)
  })

  test('validateToken returns false when no token configured', () => {
    expect(validateToken('anything')).toBe(false)
  })

  test('createTokenValidator returns middleware function', () => {
    const middleware = createTokenValidator()
    expect(typeof middleware).toBe('function')
  })

  test('middleware rejects missing token in strict mode', () => {
    process.env[TOKEN_ENV_VAR] = 'valid-token'
    const middleware = createTokenValidator({ strict: true })

    let statusCode = 0
    let jsonBody: any = null
    const req = { headers: {} }
    const res = {
      status: (code: number) => {
        statusCode = code
        return {
          json: (body: any) => {
            jsonBody = body
          },
        }
      },
    }
    const next = () => {
      statusCode = 200
    }

    middleware(req, res, next)
    expect(statusCode).toBe(401)
    expect(jsonBody.error).toContain('Invalid')
  })

  test('middleware accepts valid token', () => {
    process.env[TOKEN_ENV_VAR] = 'valid-token'
    const middleware = createTokenValidator()

    let called = false
    const req = { headers: { [TOKEN_HEADER.toLowerCase()]: 'valid-token' } }
    const res = {}
    const next = () => {
      called = true
    }

    middleware(req, res, next)
    expect(called).toBe(true)
  })

  test('constants are exported correctly', () => {
    expect(TOKEN_ENV_VAR).toBe('COMMONERS_SERVICE_TOKEN')
    expect(SESSION_ENV_VAR).toBe('COMMONERS_SESSION_ID')
    expect(TOKEN_HEADER).toBe('X-Commoners-Token')
  })
})

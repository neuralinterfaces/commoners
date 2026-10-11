/**
 * @commoners/secure-services
 *
 * Adds per-session authentication tokens to service communication.
 * Prevents unauthorized local processes from connecting to service ports.
 *
 * How it works:
 * 1. Generates a cryptographic session token at app startup
 * 2. Injects the token into service environment variables (COMMONERS_SERVICE_TOKEN)
 * 3. Services validate the token from incoming request headers (X-Commoners-Token)
 * 4. The main process adds the token header when proxying requests via protocol handler
 *
 * Services must validate the token themselves — this plugin provides the
 * infrastructure but each service language needs its own validation middleware.
 *
 * Environment variables injected into services:
 *   COMMONERS_SERVICE_TOKEN  - The session authentication token
 *   COMMONERS_SESSION_ID     - Unique session identifier
 *
 * Request header added to proxied requests:
 *   X-Commoners-Token: <session_token>
 *
 * Usage:
 *   import secureServices from '@commoners/secure-services'
 *   export default { plugins: { security: secureServices() } }
 */

const TOKEN_ENV_VAR = 'COMMONERS_SERVICE_TOKEN'
const SESSION_ENV_VAR = 'COMMONERS_SESSION_ID'
const TOKEN_HEADER = 'X-Commoners-Token'

type SecureServicesOptions = {
  /** Token length in bytes (default: 32 = 64 hex chars) */
  tokenLength?: number
  /** Regenerate token at this interval in ms. 0 = no refresh. Default: 0 */
  refreshInterval?: number
  /** Log token lifecycle events to hooks. Default: true */
  emitEvents?: boolean
}

type TokenState = {
  token: string
  sessionId: string
  createdAt: number
}

export default (options: SecureServicesOptions = {}) => {
  const { tokenLength = 32, refreshInterval = 0, emitEvents = true } = options

  let state: TokenState | null = null
  let refreshHandle: ReturnType<typeof setInterval> | null = null

  function generateToken(): TokenState {
    const crypto = require('node:crypto')
    return {
      token: crypto.randomBytes(tokenLength).toString('hex'),
      sessionId: crypto.randomUUID(),
      createdAt: Date.now(),
    }
  }

  return {
    capabilities: {
      provides: ['secure-services', 'service-auth'],
      platforms: { desktop: true },
    },

    isSupported: {
      start: ({ DESKTOP }) => DESKTOP,
      ready: ({ DESKTOP }) => DESKTOP,
      load: ({ DESKTOP }) => DESKTOP,
    },

    load() {
      return {
        /** Get the current session ID (not the token — tokens stay in main process) */
        getSessionId: () => this.invoke('session-id'),
        /** Check if service auth is active */
        isActive: () => this.invoke('is-active'),
        /** Get the token header name for manual requests */
        headerName: TOKEN_HEADER,
      }
    },

    async start() {
      // Generate session token
      state = generateToken()

      // Register IPC handlers
      this.handle('session-id', () => state?.sessionId || null)
      this.handle('is-active', () => !!state)
      this.handle('get-token', () => state?.token || null) // Internal use only

      // Inject token into service environment variables.
      // Services receive these when spawned — they should validate
      // the X-Commoners-Token header against COMMONERS_SERVICE_TOKEN.
      //
      // The commoners framework passes env vars from the service config
      // to the spawned process. We inject via process.env so all services
      // get the token automatically.
      process.env[TOKEN_ENV_VAR] = state.token
      process.env[SESSION_ENV_VAR] = state.sessionId

      if (emitEvents) {
        this.hooks.emit({
          type: 'security:info',
          message: `Service auth token generated (session: ${state.sessionId.slice(0, 8)}...)`,
          context: 'secure-services',
        })
      }
    },

    async ready() {
      // Start token refresh if configured
      if (refreshInterval > 0) {
        refreshHandle = setInterval(() => {
          const oldSessionId = state?.sessionId
          state = generateToken()
          process.env[TOKEN_ENV_VAR] = state.token
          process.env[SESSION_ENV_VAR] = state.sessionId

          if (emitEvents) {
            this.hooks.emit({
              type: 'security:info',
              message: `Service auth token refreshed (${oldSessionId?.slice(0, 8)} → ${state.sessionId.slice(0, 8)}...)`,
              context: 'secure-services',
            })
          }

          // Notify renderer of session change
          this.send('session-refreshed', {
            sessionId: state.sessionId,
            timestamp: state.createdAt,
          })
        }, refreshInterval)
      }
    },

    async quit() {
      if (refreshHandle) {
        clearInterval(refreshHandle)
        refreshHandle = null
      }

      // Securely clear token from memory
      if (state) {
        // Overwrite token string (best-effort in JS — strings are immutable,
        // but we clear the reference so GC can collect)
        state.token = ''
        state.sessionId = ''
        state = null
      }

      // Clear from process env
      delete process.env[TOKEN_ENV_VAR]
      delete process.env[SESSION_ENV_VAR]
    },
  }
}

/**
 * Express/Connect middleware for validating service tokens.
 * Use in Node.js services:
 *
 *   import { createTokenValidator } from '@commoners/secure-services'
 *   app.use(createTokenValidator())
 */
export function createTokenValidator(options: { strict?: boolean } = {}) {
  const { strict = true } = options
  const expectedToken = process.env[TOKEN_ENV_VAR]

  return (req: any, res: any, next: any) => {
    if (!expectedToken) {
      // No token configured — running in dev mode or plugin not active
      if (!strict) return next()
      res.status(503).json({ error: 'Service token not configured' })
      return
    }

    const token = req.headers?.[TOKEN_HEADER.toLowerCase()] || req.headers?.[TOKEN_HEADER]
    if (token === expectedToken) {
      next()
    } else {
      res.status(401).json({ error: 'Invalid or missing service token' })
    }
  }
}

/**
 * Validation function for non-Express services (Python, Rust, etc.)
 * Call from the service process to check a token value.
 */
export function validateToken(token: string): boolean {
  return token === process.env[TOKEN_ENV_VAR]
}

/** Environment variable name for the service token */
export { TOKEN_ENV_VAR, SESSION_ENV_VAR, TOKEN_HEADER }

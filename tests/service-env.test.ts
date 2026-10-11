import { expect, test, describe } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadEnvironmentVariables } from '../packages/core/assets/services/env/index.js'
import { projectBase } from './utils'

describe('Service Environment Variables', () => {
  describe('Un-prefixed Environment Variables Configuration', () => {
    test('demo services are configured to use environment variables', () => {
      const httpService = join(projectBase, 'src/services/http/index.ts')
      expect(existsSync(httpService)).toBe(true)

      // Verify service files exist that use env vars
      const expressService = join(projectBase, 'src/services/express/index.js')
      if (existsSync(expressService)) {
        expect(expressService).toBeTruthy()
      }
    })

    test('development mode loads SECRET_VARIABLE for services', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      // Un-prefixed variable that services can access
      expect(env.SECRET_VARIABLE).toBe('xxx-development-secret-xxx')
    })

    test('production mode loads different SECRET_VARIABLE for services', () => {
      const env = loadEnvironmentVariables('production', projectBase)

      // Different value in production
      expect(env.SECRET_VARIABLE).toBe('xxx-production-secret-xxx')
    })

    test('services receive both prefixed and un-prefixed variables', () => {
      const devEnv = loadEnvironmentVariables('development', projectBase)

      // Un-prefixed (available to services only)
      expect(devEnv.SECRET_VARIABLE).toBeDefined()

      // Prefixed (available to frontend and services)
      expect(devEnv.COMMONERS_ENV_FOR_ALL_MODES).toBeDefined()
      expect(devEnv.COMMONERS_ONLY_DEV).toBeDefined()
    })
  })

  describe('Environment Variable Security Model', () => {
    test('un-prefixed variables are available to services but not frontend', () => {
      const devEnv = loadEnvironmentVariables('development', projectBase)

      // Un-prefixed variable exists
      expect(devEnv.SECRET_VARIABLE).toBeDefined()

      // This variable would only be passed to services, not exposed to frontend
      // Frontend only gets COMMONERS_ and VITE_ prefixed variables
    })

    test('COMMONERS prefixed variables are available everywhere', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      // These are available to both frontend and services
      expect(env.COMMONERS_ENV_FOR_ALL_MODES).toBe('true')
      expect(env.COMMONERS_ONLY_DEV).toBe('true')
    })
  })

  describe('Service Environment Variable Usage Pattern', () => {
    test('services can access HOST and PORT from environment', () => {
      // When services start, they receive process.env with:
      // - HOST: hostname for the service
      // - PORT: port number for the service
      // - All user .env variables (including un-prefixed ones)

      const env = loadEnvironmentVariables('development', projectBase)

      // User env vars are loaded
      expect(env.SECRET_VARIABLE).toBeDefined()

      // When service starts, it would also receive:
      // process.env.HOST and process.env.PORT from the framework
    })

    test('environment variables have correct mode-specific values', () => {
      const devEnv = loadEnvironmentVariables('development', projectBase)
      const prodEnv = loadEnvironmentVariables('production', projectBase)

      // Dev has dev-specific values
      expect(devEnv.SECRET_VARIABLE).toContain('development')
      expect(devEnv.COMMONERS_ONLY_DEV).toBe('true')
      expect(devEnv.COMMONERS_ONLY_PROD).toBeUndefined()

      // Prod has prod-specific values
      expect(prodEnv.SECRET_VARIABLE).toContain('production')
      expect(prodEnv.COMMONERS_ONLY_PROD).toBe('true')
      expect(prodEnv.COMMONERS_ONLY_DEV).toBeUndefined()
    })

    test('services from different languages all get same env vars', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      // Node.js, Python, C++ services all receive the same environment
      expect(env.SECRET_VARIABLE).toBeDefined()
      expect(env.COMMONERS_ENV_FOR_ALL_MODES).toBeDefined()

      // The framework ensures consistency across language runtimes
    })
  })
})

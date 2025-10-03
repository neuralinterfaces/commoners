import { expect, test, describe, beforeAll, afterAll } from 'vitest'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { loadEnvironmentVariables } from '../packages/core/assets/services/env/index.js'
import { getEnvFilesForMode } from '../packages/core/assets/services/env/utils.js'
import { projectBase } from './utils'

describe('Environment Variable Loading', () => {
  describe('getEnvFilesForMode', () => {
    test('should return correct .env files for development mode', () => {
      const files = getEnvFilesForMode('development', projectBase)

      expect(files).toHaveLength(4)
      expect(files[0]).toMatch(/\.env$/)
      expect(files[1]).toMatch(/\.env\.local$/)
      expect(files[2]).toMatch(/\.env\.development$/)
      expect(files[3]).toMatch(/\.env\.development\.local$/)
    })

    test('should return correct .env files for production mode', () => {
      const files = getEnvFilesForMode('production', projectBase)

      expect(files).toHaveLength(4)
      expect(files[0]).toMatch(/\.env$/)
      expect(files[1]).toMatch(/\.env\.local$/)
      expect(files[2]).toMatch(/\.env\.production$/)
      expect(files[3]).toMatch(/\.env\.production\.local$/)
    })

    test('should normalize paths correctly', () => {
      const files = getEnvFilesForMode('test', projectBase)

      files.forEach(file => {
        // Paths should be normalized (no backslashes on Windows)
        expect(file).not.toMatch(/\\/)
      })
    })

    test('should handle custom modes', () => {
      const files = getEnvFilesForMode('staging', projectBase)

      expect(files).toHaveLength(4)
      expect(files[2]).toMatch(/\.env\.staging$/)
      expect(files[3]).toMatch(/\.env\.staging\.local$/)
    })
  })

  describe('loadEnvironmentVariables', () => {
    test('should load base .env file variables', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      // From .env file (dotenv strips outer quotes)
      expect(env.COMMONERS_ENV_FOR_ALL_MODES).toBe('true')
      expect(env.COMMONERS_UPDATED).toBe('2025-05-01T12:00:00Z')
    })

    test('should load mode-specific variables for development', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      // From .env.development (dotenv strips outer quotes)
      expect(env.SECRET_VARIABLE).toBe('xxx-development-secret-xxx')
      expect(env.COMMONERS_ONLY_DEV).toBe('true')
    })

    test('should load mode-specific variables for production', () => {
      const env = loadEnvironmentVariables('production', projectBase)

      // From .env.production (dotenv strips outer quotes)
      expect(env.SECRET_VARIABLE).toBe('xxx-production-secret-xxx')
      expect(env.COMMONERS_ONLY_PROD).toBe('true')
    })

    test('should override base variables with mode-specific ones', () => {
      const devEnv = loadEnvironmentVariables('development', projectBase)
      const prodEnv = loadEnvironmentVariables('production', projectBase)

      // SECRET_VARIABLE should differ between modes
      expect(devEnv.SECRET_VARIABLE).not.toBe(prodEnv.SECRET_VARIABLE)
      expect(devEnv.SECRET_VARIABLE).toContain('development')
      expect(prodEnv.SECRET_VARIABLE).toContain('production')
    })

    test('should cache loaded environment variables', () => {
      const env1 = loadEnvironmentVariables('development', projectBase)
      const env2 = loadEnvironmentVariables('development', projectBase)

      // Should return the same object (cached)
      expect(env1).toBe(env2)
    })

    test('should handle different roots separately', () => {
      const env1 = loadEnvironmentVariables('development', projectBase)
      const env2 = loadEnvironmentVariables('development', '/different/path')

      // Should not be the same (different cache keys)
      expect(env1).not.toBe(env2)
    })

    test('should include un-prefixed environment variables', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      // Un-prefixed variable (no COMMONERS_ or VITE_ prefix)
      expect(env.SECRET_VARIABLE).toBeDefined()
    })

    test('should handle missing .env files gracefully', () => {
      const tempDir = join(projectBase, '.tmp-env-test')
      mkdirSync(tempDir, { recursive: true })

      try {
        const env = loadEnvironmentVariables('test', tempDir)
        expect(env).toEqual({})
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  describe('Environment Variable Priority', () => {
    test('should prioritize mode-specific over base .env', () => {
      const tempDir = join(projectBase, `.tmp-priority-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        // Create .env with base value
        writeFileSync(join(tempDir, '.env'), 'TEST_VAR=base')

        // Create .env.development with override
        writeFileSync(join(tempDir, '.env.development'), 'TEST_VAR=development')

        const env = loadEnvironmentVariables('development', tempDir)

        // Mode-specific should win
        expect(env.TEST_VAR).toBe('development')
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('should load variables from file order', () => {
      const tempDir = join(projectBase, `.tmp-local-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        // Files are loaded in order: .env, .env.local, .env.{mode}, .env.{mode}.local
        writeFileSync(join(tempDir, '.env'), 'VAR=base')
        writeFileSync(join(tempDir, '.env.local'), 'VAR=local')
        writeFileSync(join(tempDir, '.env.test'), 'VAR=test')
        writeFileSync(join(tempDir, '.env.test.local'), 'VAR=test-local')

        const env = loadEnvironmentVariables('test', tempDir)

        // Last file wins (test-local)
        expect(env.VAR).toBe('test-local')
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  describe('Variable Parsing', () => {
    test('should parse basic key=value', () => {
      const tempDir = join(projectBase, `.tmp-parse-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        writeFileSync(join(tempDir, '.env'), 'KEY=value')
        const env = loadEnvironmentVariables('dev', tempDir)
        expect(env.KEY).toBe('value')
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('should parse quoted values', () => {
      const tempDir = join(projectBase, `.tmp-quoted-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        writeFileSync(join(tempDir, '.env'), 'QUOTED="quoted value"')
        const env = loadEnvironmentVariables('dev', tempDir)
        expect(env.QUOTED).toBe('quoted value')
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('should parse single-quoted values', () => {
      const tempDir = join(projectBase, `.tmp-single-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        writeFileSync(join(tempDir, '.env'), "SINGLE='single quoted'")
        const env = loadEnvironmentVariables('dev', tempDir)
        expect(env.SINGLE).toBe('single quoted')
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('should handle comments', () => {
      const tempDir = join(projectBase, `.tmp-comments-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        writeFileSync(join(tempDir, '.env'), '# Comment\nKEY=value\n# Another comment')
        const env = loadEnvironmentVariables('dev', tempDir)
        expect(env.KEY).toBe('value')
        expect(Object.keys(env)).toHaveLength(1)
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  describe('Integration with Services', () => {
    test('demo project has expected .env files', () => {
      const baseEnv = join(projectBase, '.env')
      const devEnv = join(projectBase, '.env.development')
      const prodEnv = join(projectBase, '.env.production')

      expect(existsSync(baseEnv)).toBe(true)
      expect(existsSync(devEnv)).toBe(true)
      expect(existsSync(prodEnv)).toBe(true)
    })

    test('development mode loads correct SECRET_VARIABLE', () => {
      const env = loadEnvironmentVariables('development', projectBase)

      expect(env.SECRET_VARIABLE).toContain('development')
      expect(env.SECRET_VARIABLE).toContain('xxx')
    })

    test('production mode loads correct SECRET_VARIABLE', () => {
      const env = loadEnvironmentVariables('production', projectBase)

      expect(env.SECRET_VARIABLE).toContain('production')
      expect(env.SECRET_VARIABLE).toContain('xxx')
    })

    test('COMMONERS_ENV_FOR_ALL_MODES is available in all modes', () => {
      const devEnv = loadEnvironmentVariables('development', projectBase)
      const prodEnv = loadEnvironmentVariables('production', projectBase)

      expect(devEnv.COMMONERS_ENV_FOR_ALL_MODES).toBe('true')
      expect(prodEnv.COMMONERS_ENV_FOR_ALL_MODES).toBe('true')
    })

    test('mode-specific flags are only in correct mode', () => {
      const devEnv = loadEnvironmentVariables('development', projectBase)
      const prodEnv = loadEnvironmentVariables('production', projectBase)

      expect(devEnv.COMMONERS_ONLY_DEV).toBe('true')
      expect(devEnv.COMMONERS_ONLY_PROD).toBeUndefined()

      expect(prodEnv.COMMONERS_ONLY_PROD).toBe('true')
      expect(prodEnv.COMMONERS_ONLY_DEV).toBeUndefined()
    })
  })
})

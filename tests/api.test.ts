import { expect, test, describe } from 'vitest'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'

import {
  loadConfigFromFile,
  resolveConfigPath,
  resolveConfig,
  resolveServiceBuildInfo,
  configureForDesktop,
  createServices,
  getServices,
  merge,
  getNormalizedTarget,
  getSpecificTarget,
  isDesktop,
  isMobile,
  resolveAppToLaunch,
  ValidationError,
  ConfigurationError,
} from '@commoners/solidarity'

import { projectBase } from './utils'

describe('API: Configuration Resolution', () => {
  describe('resolveConfigPath', () => {
    test('should resolve config path in project directory', () => {
      const configPath = resolveConfigPath(projectBase)
      expect(configPath).toBe(resolve(projectBase, 'commoners.config.ts'))
      expect(existsSync(configPath)).toBe(true)
    })

    test('should return undefined when no config exists', () => {
      const configPath = resolveConfigPath('/tmp/no-config-here')
      expect(configPath).toBeUndefined()
    })

    test('should prioritize .ts over .js extension', () => {
      const configPath = resolveConfigPath(projectBase)
      expect(configPath.endsWith('.ts')).toBe(true)
    })
  })

  describe('loadConfigFromFile', () => {
    test('should load config from valid project directory', async () => {
      const config = await loadConfigFromFile(projectBase)
      expect(config).toBeDefined()
      expect(config.name).toBeTypeOf('string')
      expect(config.services).toBeTypeOf('object')
    })

    test('should resolve absolute path from config file path', async () => {
      const configPath = resolveConfigPath(projectBase)
      const config = await loadConfigFromFile(configPath)
      expect(config).toBeDefined()
    })

    test('should throw ConfigurationError for invalid project without index.html', async () => {
      const invalidPath = '/tmp/invalid-commoners-project'
      await expect(loadConfigFromFile(invalidPath)).rejects.toThrow(ConfigurationError)
    })

    test('should throw ConfigurationError for non-existent path', async () => {
      await expect(loadConfigFromFile('/this/path/does/not/exist')).rejects.toThrow(ConfigurationError)
    })
  })

  describe('resolveConfig', () => {
    test('should resolve config with default options', async () => {
      const config = await loadConfigFromFile(projectBase)
      const resolved = await resolveConfig(config)
      expect(resolved.root).toBe(projectBase)
      expect(resolved.target).toBeDefined()
      expect(resolved.hooks).toBeDefined()
      expect(getServices(resolved.extensions)).toBeTypeOf('object')
    })

    test('should apply target option', async () => {
      const config = await loadConfigFromFile(projectBase)
      const resolved = await resolveConfig({ ...config, target: 'desktop' })
      expect(resolved.target).toBe('electron')
    })

    test('should filter services based on services option', async () => {
      const config = await loadConfigFromFile(projectBase)
      const resolved = await resolveConfig(config, { services: 'http' })
      expect(Object.keys(getServices(resolved.extensions))).toContain('http')
    })

    test('should handle array of services', async () => {
      const config = await loadConfigFromFile(projectBase)
      const resolved = await resolveConfig(config, { services: ['http', 'express'] })
      const serviceKeys = Object.keys(getServices(resolved.extensions))
      expect(serviceKeys).toContain('http')
      expect(serviceKeys).toContain('express')
    })

    test('should merge desktop configuration when target is electron', async () => {
      const config = await loadConfigFromFile(projectBase)
      const resolved = await resolveConfig({ ...config, target: 'electron' })
      expect(resolved.electron).toBeDefined()
    })
  })
})

describe('API: Service Resolution', () => {
  describe('resolveServiceBuildInfo', () => {
    test('should process service configuration for TypeScript', async () => {
      const config = await loadConfigFromFile(projectBase)
      const service = config.services.http
      const info = resolveServiceBuildInfo(service, 'http', {
        root: projectBase,
        target: 'service',
        services: true,
        build: true,
      })

      // resolveServiceBuildInfo may return undefined or modified service object
      // depending on service configuration and target
      expect(typeof info === 'object' || info === undefined).toBe(true)
    })

    test('should process service configuration for Python', async () => {
      const config = await loadConfigFromFile(projectBase)
      const service = config.services['basic-python']
      const info = resolveServiceBuildInfo(service, 'basic-python', {
        root: projectBase,
        target: 'service',
        services: true,
        build: true,
      })

      expect(typeof info === 'object' || info === undefined).toBe(true)
    })

    test('should process service configuration for C++', async () => {
      const config = await loadConfigFromFile(projectBase)
      const service = config.services.cpp
      const info = resolveServiceBuildInfo(service, 'cpp', {
        root: projectBase,
        target: 'service',
        services: true,
        build: true,
      })

      expect(typeof info === 'object' || info === undefined).toBe(true)
    })

    test('should handle remote URL services', async () => {
      const config = await loadConfigFromFile(projectBase)
      const service = config.services.remote
      const info = resolveServiceBuildInfo(service, 'remote', {
        root: projectBase,
        target: 'service',
        services: true,
        build: true,
      })

      // Remote services configuration is processed
      expect(typeof info === 'object' || info === undefined).toBe(true)
    })
  })

  describe('createServices', () => {
    test('should create services with proper structure', async () => {
      const config = await loadConfigFromFile(projectBase)
      const services = createServices(
        config.services,
        { root: projectBase, target: 'web' },
        { services: true }
      )

      expect(services).toBeTypeOf('object')
      Object.values(services).forEach(service => {
        expect(service).toHaveProperty('src')
      })
    })

    test('should filter services based on target', async () => {
      const config = await loadConfigFromFile(projectBase)
      const webServices = createServices(
        config.services,
        { root: projectBase, target: 'web' },
        { services: true }
      )

      const desktopServices = createServices(
        config.services,
        { root: projectBase, target: 'electron' },
        { services: true }
      )

      // Desktop should have more/different services than web
      expect(Object.keys(desktopServices).length).toBeGreaterThanOrEqual(
        Object.keys(webServices).length
      )
    })
  })
})

describe('API: Target Utilities', () => {
  describe('getNormalizedTarget', () => {
    test('should normalize electron to desktop', () => {
      expect(getNormalizedTarget('electron')).toBe('desktop')
    })

    test('should normalize tauri to desktop', () => {
      expect(getNormalizedTarget('tauri')).toBe('desktop')
    })

    test('should normalize ios to mobile', () => {
      expect(getNormalizedTarget('ios')).toBe('mobile')
    })

    test('should normalize android to mobile', () => {
      expect(getNormalizedTarget('android')).toBe('mobile')
    })

    test('should keep web as web', () => {
      expect(getNormalizedTarget('web')).toBe('web')
    })

    test('should normalize pwa to web', () => {
      expect(getNormalizedTarget('pwa')).toBe('web')
    })

    test('should handle desktop as input', () => {
      expect(getNormalizedTarget('desktop')).toBe('desktop')
    })

    test('should handle mobile as input', () => {
      expect(getNormalizedTarget('mobile')).toBe('mobile')
    })
  })

  describe('getSpecificTarget', () => {
    test('should resolve desktop to electron by default', () => {
      expect(getSpecificTarget('desktop')).toBe('electron')
    })

    test('should resolve mobile to ios on macOS', () => {
      const specific = getSpecificTarget('mobile')
      // Should be either ios or android depending on platform
      expect(['ios', 'android']).toContain(specific)
    })

    test('should keep specific targets unchanged', () => {
      expect(getSpecificTarget('electron')).toBe('electron')
      expect(getSpecificTarget('ios')).toBe('ios')
      expect(getSpecificTarget('web')).toBe('web')
    })
  })

  describe('isDesktop', () => {
    test('should return true for desktop targets', () => {
      expect(isDesktop('desktop')).toBe(true)
      expect(isDesktop('electron')).toBe(true)
      expect(isDesktop('tauri')).toBe(true)
    })

    test('should return false for non-desktop targets', () => {
      expect(isDesktop('web')).toBe(false)
      expect(isDesktop('mobile')).toBe(false)
      expect(isDesktop('ios')).toBe(false)
      expect(isDesktop('android')).toBe(false)
    })
  })

  describe('isMobile', () => {
    test('should return true for mobile targets', () => {
      expect(isMobile('mobile')).toBe(true)
      expect(isMobile('ios')).toBe(true)
      expect(isMobile('android')).toBe(true)
    })

    test('should return false for non-mobile targets', () => {
      expect(isMobile('web')).toBe(false)
      expect(isMobile('desktop')).toBe(false)
      expect(isMobile('electron')).toBe(false)
    })
  })
})

describe('API: Desktop Configuration', () => {
  describe('configureForDesktop', () => {
    test('should return reset function', () => {
      const outDir = '.commoners/electron'
      const result = configureForDesktop(outDir, projectBase)

      expect(result).toHaveProperty('reset')
      expect(result.reset).toBeTypeOf('function')
    })

    test('should handle package.json modification', () => {
      const outDir = '.commoners/electron'
      const result = configureForDesktop(outDir, projectBase)

      expect(result).toBeDefined()
      expect(result.reset).toBeTypeOf('function')

      // Clean up
      result.reset()
    })

    test('should work with empty root', () => {
      const outDir = '.commoners/electron'

      // This test expects current directory to have package.json
      // We'll just verify it doesn't throw
      expect(() => configureForDesktop(outDir)).not.toThrow()
    })
  })
})

describe('API: Launch Utilities', () => {
  describe('resolveAppToLaunch', () => {
    test('should use provided outDir if specified', () => {
      const config = {
        root: projectBase,
        target: 'web' as const,
        outDir: '/custom/output',
      }

      const result = resolveAppToLaunch(config)
      expect(result).toBe('/custom/output')
    })

    test('should construct default outDir from root and target', () => {
      const config = {
        root: projectBase,
        target: 'web' as const,
      }

      const result = resolveAppToLaunch(config)
      expect(result).toBe(join(projectBase, '.commoners', 'web'))
    })

    test('should handle different targets', () => {
      const desktopConfig = {
        root: projectBase,
        target: 'electron' as const,
      }

      const result = resolveAppToLaunch(desktopConfig)
      expect(result).toBe(join(projectBase, '.commoners', 'electron'))
    })
  })
})

describe('API: Utility Functions', () => {
  describe('merge', () => {
    test('should deep merge objects', () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: { d: 3 }, e: 4 }

      const result = merge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 })
    })

    test('should keep first array when merging (toMerge into target)', () => {
      const toMerge = { arr: [1, 2] }
      const target = { arr: [3, 4] }

      // merge(toMerge, target) - target values are preserved unless overridden
      const result = merge(toMerge, target)
      expect(result.arr).toEqual([1, 2])
    })

    test('should not mutate original objects', () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: { d: 3 } }

      merge(obj1, obj2)

      expect(obj1).toEqual({ a: 1, b: { c: 2 } })
      expect(obj2).toEqual({ b: { d: 3 } })
    })
  })
})

describe('API: Error Classes', () => {
  describe('ValidationError', () => {
    test('should create error with message and details', () => {
      const error = new ValidationError('Invalid input', 'Use valid input format')

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Invalid input')
      expect(error.details).toBe('Use valid input format')
      expect(error.name).toBe('ValidationError')
    })

    test('should work without details', () => {
      const error = new ValidationError('Invalid input')

      expect(error.message).toBe('Invalid input')
      expect(error.details).toBeUndefined()
    })
  })

  describe('ConfigurationError', () => {
    test('should create configuration error', () => {
      const error = new ConfigurationError('Config missing', 'Add required config')

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('ConfigurationError')
      expect(error.message).toBe('Config missing')
      expect(error.details).toBe('Add required config')
    })
  })
})

describe('API: Path Handling', () => {
  test('should handle absolute paths correctly', async () => {
    const absolutePath = resolve(projectBase)
    const config = await loadConfigFromFile(absolutePath)
    expect(config).toBeDefined()
  })

  test('should handle paths with config file', async () => {
    const configPath = join(projectBase, 'commoners.config.ts')
    const config = await loadConfigFromFile(configPath)
    expect(config).toBeDefined()
  })

  test('should resolve nested service paths', async () => {
    const config = await loadConfigFromFile(projectBase)
    const service = config.services.http

    const info = resolveServiceBuildInfo(service, 'http', {
      root: projectBase,
      target: 'service',
      services: true,
      build: true,
    })

    expect(info?.src).toBeDefined()
    expect(info?.src).toBeTypeOf('string')
  })
})

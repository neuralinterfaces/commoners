import { expect, test, describe } from 'vitest'
import {
  CommonersError,
  ConfigurationError,
  ValidationError,
  DependencyError,
  PlatformError,
  BuildError,
} from '@commoners/solidarity'

describe('API: Error Classes', () => {
  describe('CommonersError', () => {
    test('should create base error with message', () => {
      const error = new CommonersError('Something went wrong')

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('CommonersError')
      expect(error.message).toBe('Something went wrong')
    })

    test('should create error with details', () => {
      const error = new CommonersError('Something went wrong', 'Try this fix')

      expect(error.details).toBe('Try this fix')
    })

    test('should have stack trace', () => {
      const error = new CommonersError('Test error')
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('CommonersError')
    })

    test('should be catchable as Error', () => {
      let caught = false

      try {
        throw new CommonersError('Test')
      } catch (err) {
        if (err instanceof Error) {
          caught = true
        }
      }

      expect(caught).toBe(true)
    })

    test('should be catchable as CommonersError', () => {
      let caught = false

      try {
        throw new CommonersError('Test')
      } catch (err) {
        if (err instanceof CommonersError) {
          caught = true
        }
      }

      expect(caught).toBe(true)
    })
  })

  describe('ConfigurationError', () => {
    test('should create configuration error', () => {
      const error = new ConfigurationError('Invalid config')

      expect(error).toBeInstanceOf(CommonersError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('ConfigurationError')
      expect(error.message).toBe('Invalid config')
    })

    test('should support details', () => {
      const error = new ConfigurationError(
        'Missing required field',
        'Add the "name" field to your config'
      )

      expect(error.details).toBe('Add the "name" field to your config')
    })

    test('should be distinguishable from other error types', () => {
      const error = new ConfigurationError('Config error')

      expect(error instanceof ConfigurationError).toBe(true)
      expect(error instanceof ValidationError).toBe(false)
      expect(error instanceof BuildError).toBe(false)
    })
  })

  describe('ValidationError', () => {
    test('should create validation error', () => {
      const error = new ValidationError('Invalid input')

      expect(error).toBeInstanceOf(CommonersError)
      expect(error.name).toBe('ValidationError')
      expect(error.message).toBe('Invalid input')
    })

    test('should provide helpful details', () => {
      const error = new ValidationError(
        'Invalid target "xyz"',
        'Valid targets are: web, pwa, desktop, mobile'
      )

      expect(error.details).toBe('Valid targets are: web, pwa, desktop, mobile')
    })

    test('should work without details', () => {
      const error = new ValidationError('Invalid value')

      expect(error.details).toBeUndefined()
      expect(error.message).toBe('Invalid value')
    })
  })

  describe('DependencyError', () => {
    test('should create dependency error', () => {
      const error = new DependencyError('Missing dependency: typescript')

      expect(error).toBeInstanceOf(CommonersError)
      expect(error.name).toBe('DependencyError')
      expect(error.message).toBe('Missing dependency: typescript')
    })

    test('should provide installation details', () => {
      const error = new DependencyError(
        'Package not found',
        'Install with: pnpm add package-name'
      )

      expect(error.details).toBe('Install with: pnpm add package-name')
    })
  })

  describe('PlatformError', () => {
    test('should create platform error', () => {
      const error = new PlatformError('iOS build requires macOS')

      expect(error).toBeInstanceOf(CommonersError)
      expect(error.name).toBe('PlatformError')
      expect(error.message).toBe('iOS build requires macOS')
    })

    test('should provide platform-specific details', () => {
      const error = new PlatformError(
        'Unsupported platform',
        'Use --target web for cross-platform builds'
      )

      expect(error.details).toBe('Use --target web for cross-platform builds')
    })
  })

  describe('BuildError', () => {
    test('should create build error', () => {
      const error = new BuildError('Build failed')

      expect(error).toBeInstanceOf(CommonersError)
      expect(error.name).toBe('BuildError')
      expect(error.message).toBe('Build failed')
    })

    test('should provide build-specific context', () => {
      const error = new BuildError(
        'TypeScript compilation failed',
        'Fix type errors before building'
      )

      expect(error.details).toBe('Fix type errors before building')
    })

    test('should include detailed error information', () => {
      const error = new BuildError(
        'Service build failed: http',
        'Check service configuration and source file'
      )

      expect(error.message).toContain('http')
      expect(error.details).toContain('configuration')
    })
  })

  describe('Error Inheritance Chain', () => {
    test('all errors should inherit from CommonersError', () => {
      const errors = [
        new ConfigurationError('test'),
        new ValidationError('test'),
        new DependencyError('test'),
        new PlatformError('test'),
        new BuildError('test'),
      ]

      errors.forEach(error => {
        expect(error).toBeInstanceOf(CommonersError)
        expect(error).toBeInstanceOf(Error)
      })
    })

    test('should be catchable by specific type', () => {
      const errors = [
        { error: new ConfigurationError('test'), type: ConfigurationError },
        { error: new ValidationError('test'), type: ValidationError },
        { error: new DependencyError('test'), type: DependencyError },
        { error: new PlatformError('test'), type: PlatformError },
        { error: new BuildError('test'), type: BuildError },
      ]

      errors.forEach(({ error, type }) => {
        let caught = false

        try {
          throw error
        } catch (err) {
          if (err instanceof type) {
            caught = true
          }
        }

        expect(caught).toBe(true)
      })
    })

    test('should be catchable by base type', () => {
      const errors = [
        new ConfigurationError('test'),
        new ValidationError('test'),
        new DependencyError('test'),
        new PlatformError('test'),
        new BuildError('test'),
      ]

      errors.forEach(error => {
        let caught = false

        try {
          throw error
        } catch (err) {
          if (err instanceof CommonersError) {
            caught = true
          }
        }

        expect(caught).toBe(true)
      })
    })
  })

  describe('Error Message Formatting', () => {
    test('should preserve message exactly as provided', () => {
      const message = 'This is a detailed error message with context'
      const error = new CommonersError(message)

      expect(error.message).toBe(message)
    })

    test('should handle multi-line messages', () => {
      const message = 'Error occurred\nLine 2\nLine 3'
      const error = new ValidationError(message)

      expect(error.message).toBe(message)
      expect(error.message).toContain('\n')
    })

    test('should handle special characters in message', () => {
      const message = 'Error: "file.ts" not found in @scope/package'
      const error = new BuildError(message)

      expect(error.message).toBe(message)
    })
  })

  describe('Error Context and Debugging', () => {
    test('should include file name in stack trace', () => {
      const error = new CommonersError('Test error')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('errors.test')
    })

    test('should preserve original error type in name property', () => {
      const errors = [
        { error: new ConfigurationError('test'), expectedName: 'ConfigurationError' },
        { error: new ValidationError('test'), expectedName: 'ValidationError' },
        { error: new DependencyError('test'), expectedName: 'DependencyError' },
        { error: new PlatformError('test'), expectedName: 'PlatformError' },
        { error: new BuildError('test'), expectedName: 'BuildError' },
      ]

      errors.forEach(({ error, expectedName }) => {
        expect(error.name).toBe(expectedName)
      })
    })

    test('should support error chaining', () => {
      const originalError = new Error('Original error')
      const wrappedError = new BuildError(
        `Build failed: ${originalError.message}`,
        'Check the build logs for details'
      )

      expect(wrappedError.message).toContain('Original error')
      expect(wrappedError.details).toBeDefined()
    })
  })

  describe('Error Use Cases', () => {
    test('should handle configuration validation', () => {
      const validateConfig = (config: any) => {
        if (!config.name) {
          throw new ConfigurationError(
            'Missing required field: name',
            'Add a "name" field to your commoners.config file'
          )
        }
      }

      expect(() => validateConfig({})).toThrow(ConfigurationError)
      expect(() => validateConfig({})).toThrow('Missing required field')
    })

    test('should handle invalid target validation', () => {
      const validateTarget = (target: string) => {
        const validTargets = ['web', 'pwa', 'desktop', 'mobile']
        if (!validTargets.includes(target)) {
          throw new ValidationError(
            `Invalid target: ${target}`,
            `Valid targets are: ${validTargets.join(', ')}`
          )
        }
      }

      expect(() => validateTarget('invalid')).toThrow(ValidationError)
      expect(() => validateTarget('web')).not.toThrow()
    })

    test('should handle missing dependencies', () => {
      const checkDependency = (dep: string, installed: string[]) => {
        if (!installed.includes(dep)) {
          throw new DependencyError(
            `Missing dependency: ${dep}`,
            `Install with: pnpm add ${dep}`
          )
        }
      }

      expect(() => checkDependency('typescript', [])).toThrow(DependencyError)
      expect(() => checkDependency('typescript', ['typescript'])).not.toThrow()
    })

    test('should handle platform incompatibilities', () => {
      const checkPlatform = (target: string, platform: string) => {
        if (target === 'ios' && platform !== 'darwin') {
          throw new PlatformError(
            'iOS builds require macOS',
            'Use --target web for cross-platform builds'
          )
        }
      }

      expect(() => checkPlatform('ios', 'linux')).toThrow(PlatformError)
      expect(() => checkPlatform('web', 'linux')).not.toThrow()
    })

    test('should handle build failures', () => {
      const buildService = (name: string, hasError: boolean) => {
        if (hasError) {
          throw new BuildError(
            `Failed to build service: ${name}`,
            'Check service configuration and dependencies'
          )
        }
      }

      expect(() => buildService('http', true)).toThrow(BuildError)
      expect(() => buildService('http', false)).not.toThrow()
    })
  })
})

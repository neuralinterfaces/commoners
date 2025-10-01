/**
 * Custom error classes for Commoners
 * These replace process.exit() calls to allow proper error handling in library usage
 */

export class CommonersError extends Error {
  constructor(message: string, public details?: string) {
    super(message)
    this.name = 'CommonersError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ConfigurationError extends CommonersError {
  constructor(message: string, details?: string) {
    super(message, details)
    this.name = 'ConfigurationError'
  }
}

export class ValidationError extends CommonersError {
  constructor(message: string, details?: string) {
    super(message, details)
    this.name = 'ValidationError'
  }
}

export class DependencyError extends CommonersError {
  constructor(message: string, details?: string) {
    super(message, details)
    this.name = 'DependencyError'
  }
}

export class PlatformError extends CommonersError {
  constructor(message: string, details?: string) {
    super(message, details)
    this.name = 'PlatformError'
  }
}

export class BuildError extends CommonersError {
  constructor(message: string, details?: string) {
    super(message, details)
    this.name = 'BuildError'
  }
}

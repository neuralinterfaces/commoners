/**
 * Security utilities for validating user inputs
 */

import { resolve, normalize, relative, isAbsolute } from 'node:path'
import { ValidationError } from '../errors.js'

/**
 * Validates a path to prevent directory traversal attacks
 * @param userPath - The path provided by the user
 * @param basePath - The base directory that should contain the path
 * @param pathDescription - Description of what the path is for (for error messages)
 * @returns The validated absolute path
 * @throws ValidationError if path escapes the base directory
 */
export function validatePath(
  userPath: string,
  basePath: string,
  pathDescription = 'path'
): string {
  if (!userPath) {
    throw new ValidationError(
      `Invalid ${pathDescription}`,
      'Path cannot be empty'
    )
  }

  // Resolve to absolute paths
  const absoluteBase = resolve(basePath)
  const absolutePath = isAbsolute(userPath) ? resolve(userPath) : resolve(basePath, userPath)

  // Normalize to remove .. and . segments
  const normalizedPath = normalize(absolutePath)

  // Check if the path is within the base directory
  const relativePath = relative(absoluteBase, normalizedPath)

  // If relative path starts with .. or is absolute, it's outside the base
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new ValidationError(
      `Invalid ${pathDescription}: Path traversal detected`,
      `Path "${userPath}" attempts to escape base directory "${absoluteBase}"`
    )
  }

  return normalizedPath
}

/**
 * Validates multiple paths at once
 * @param paths - Array of paths to validate
 * @param basePath - The base directory
 * @param pathDescription - Description for error messages
 * @returns Array of validated paths
 */
export function validatePaths(
  paths: string[],
  basePath: string,
  pathDescription = 'paths'
): string[] {
  return paths.map((path, index) =>
    validatePath(path, basePath, `${pathDescription}[${index}]`)
  )
}

/**
 * Validates that a config path is safe to load
 * Special handling for config files which may be outside project root
 * @param configPath - Path to config file
 * @param allowedDirs - Array of allowed base directories
 * @returns Validated absolute path
 */
export function validateConfigPath(
  configPath: string,
  allowedDirs: string[] = [process.cwd()]
): string {
  if (!configPath) {
    throw new ValidationError(
      'Invalid config path',
      'Config path cannot be empty'
    )
  }

  const absolutePath = isAbsolute(configPath) ? resolve(configPath) : resolve(process.cwd(), configPath)
  const normalizedPath = normalize(absolutePath)

  // Check if path is within any allowed directory
  const isAllowed = allowedDirs.some(dir => {
    const rel = relative(resolve(dir), normalizedPath)
    return !rel.startsWith('..') && !isAbsolute(rel)
  })

  if (!isAllowed) {
    throw new ValidationError(
      'Invalid config path',
      `Config file must be within allowed directories. Attempted: ${normalizedPath}`
    )
  }

  return normalizedPath
}

/**
 * Sanitizes a filename to prevent path traversal and special characters
 * @param filename - The filename to sanitize
 * @returns Sanitized filename (no path components)
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) {
    throw new ValidationError('Invalid filename', 'Filename cannot be empty')
  }

  // Remove any path components
  const basename = filename.split(/[/\\]/).pop() || ''

  // Remove dangerous characters
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_')

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new ValidationError(
      'Invalid filename',
      `Filename "${filename}" is not allowed`
    )
  }

  return sanitized
}

/**
 * Validates a service build command for safety
 * Prevents command injection by checking for shell metacharacters
 * @param command - The build command to validate
 * @returns The validated command
 * @throws ValidationError if command contains dangerous characters
 */
export function validateBuildCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    throw new ValidationError(
      'Invalid build command',
      'Build command must be a non-empty string'
    )
  }

  // Check for shell metacharacters that could enable command injection
  const dangerousChars = /[;&|`$()<>]/
  if (dangerousChars.test(command)) {
    throw new ValidationError(
      'Invalid build command',
      `Build command contains dangerous characters: "${command}". Use array format for complex commands.`
    )
  }

  return command
}

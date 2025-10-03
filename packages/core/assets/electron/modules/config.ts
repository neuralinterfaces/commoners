/**
 * Configuration Module
 *
 * Handles loading and parsing Commoners configuration for Electron main process.
 * This module is responsible for:
 * - Path resolution (asset root, project root)
 * - Config file loading
 * - Option parsing (electron, protocol, window options)
 * - Security settings resolution
 */

import { join } from 'node:path'
import { ElectronSecuritySettings } from '../../../types'

export interface ElectronConfig {
  config: any
  electron: any
  plugins: Record<string, any>
  hooks: any
}

export interface ConfigPaths {
  ASSET_ROOT_DIR: string
  PROJECT_ROOT_DIR: string
  viteAssetsPath: string
  configPath: string
  DEV_SERVER_URL: string | undefined
}

export interface ParsedOptions {
  electronOptions: any
  protocolOptions: any
  windowOptions: any
  securitySettings: ElectronSecuritySettings
}

// Default security settings
export function getDefaultSecuritySettings(isProduction = true): ElectronSecuritySettings {
  return {
    contextIsolation: true, // Enable context isolation by default
    nodeIntegration: false, // Disable Node.js integration by default
    sandbox: true, // Enable sandboxing by default
    devTools: !isProduction, // Disable devTools in production
    asarIntegrity: true, // Enable ASAR integrity checks by default
  }
}

/**
 * Get configured paths for the Electron application
 */
export function getPaths(isProduction: boolean = true): ConfigPaths {
  const ASSET_ROOT_DIR = __dirname
  const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
  const PROJECT_ROOT_DIR = isProduction ? ASSET_ROOT_DIR : process.cwd() // CWD is the project root in development
  const viteAssetsPath = join(ASSET_ROOT_DIR, 'assets')
  const configPath = join(viteAssetsPath, 'commoners.config.cjs') // Load the .cjs config version

  return {
    ASSET_ROOT_DIR,
    PROJECT_ROOT_DIR,
    viteAssetsPath,
    configPath,
    DEV_SERVER_URL,
  }
}

/**
 * Load the Commoners configuration file
 */
export function loadConfig(isProduction: boolean = true): ElectronConfig {
  const { configPath } = getPaths(isProduction)
  const _config = require(configPath) // Requires putting the dist at the Resource Path
  const config = _config.default || _config

  return {
    config,
    electron: config.electron ?? {},
    plugins: config.plugins ?? {},
    hooks: config.hooks,
  }
}

/**
 * Parse configuration options for Electron, protocol, window, and security
 */
export function parseOptions(
  config: ElectronConfig,
  isProduction: boolean = true
): ParsedOptions {
  const { electron } = config

  // Parse protocol options
  const protocolOptions = electron.protocol
    ? typeof electron.protocol === 'string'
      ? { scheme: electron.protocol }
      : electron.protocol
    : {}

  // Parse window options
  const windowOptions = electron.window ?? {}

  // Parse security settings
  const __userSecuritySetting = electron.security || true

  const securitySettings: ElectronSecuritySettings = {}
  if (__userSecuritySetting) {
    Object.assign(securitySettings, getDefaultSecuritySettings(isProduction))
    if (typeof __userSecuritySetting === 'object') {
      Object.assign(securitySettings, __userSecuritySetting) // Merge with custom security settings if provided
    }
  }

  return {
    electronOptions: electron,
    protocolOptions,
    windowOptions,
    securitySettings,
  }
}
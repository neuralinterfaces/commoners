/**
 * Security Module
 *
 * Handles app signature verification and security settings for Electron.
 * This module is responsible for:
 * - Signature verification in production
 * - Security dialog handling
 * - Content Security Policy (CSP) configuration
 * - Security settings application
 */

import { ElectronSecuritySettings } from '../../../types'
import { buildCSP, resolveCSP, type CSPDirectives } from '../../utils/csp.js'
import { hasSignature, verifySignature, verifyAsarIntegrity } from '../security'
import { getDefaultSecuritySettings } from './config'

export interface VerificationCallbacks {
  showErrorBox: (title: string, content: string) => void
  getAppName: () => string
  quit: () => void
}

/**
 * Get security settings with defaults applied
 */
export function getSecuritySettings(
  userSettings: boolean | ElectronSecuritySettings,
  isProduction: boolean
): ElectronSecuritySettings {
  const DEFAULT_SECURITY_SETTINGS = getDefaultSecuritySettings(isProduction)
  const securitySettings: ElectronSecuritySettings = {}

  if (userSettings) {
    Object.assign(securitySettings, DEFAULT_SECURITY_SETTINGS)
    if (typeof userSettings === 'object') {
      Object.assign(securitySettings, userSettings)
    }
  }

  return securitySettings
}

/**
 * Run application integrity verification
 * Returns true if verification passes or is not required
 * Returns false if verification fails (app should exit)
 */
export async function runVerification(
  isProduction: boolean,
  callbacks: VerificationCallbacks
): Promise<boolean> {
  // Verify that the application integrity is intact when running in production
  if (!isProduction) return true

  // Check ASAR integrity first (if enabled via fuses, Electron will block startup automatically)
  const asarCheck = verifyAsarIntegrity()
  if (asarCheck.enabled) {
    console.log('🔒 ASAR integrity validation is active')
  } else if (asarCheck.error) {
    console.warn(`⚠️  ASAR integrity check: ${asarCheck.error}`)
  }

  const signatureExists = await hasSignature() // Check if the application has a valid signature

  if (signatureExists) {
    const isValid = await verifySignature() // Perform the executable signature check

    if (!isValid) {
      const messageBase = `This application has an invalid signature, which indicates a security issue or corruption.`
      callbacks.showErrorBox(
        `${callbacks.getAppName()} Integrity Check Failed`,
        `${messageBase}\n\nPlease contact support or reinstall the application.`
      )

      // Exit with error message
      if (globalThis.COMMONERS_QUIT) {
        globalThis.COMMONERS_QUIT(messageBase)
      } else {
        callbacks.quit()
      }

      return false
    }
  } else {
    console.warn(
      `⚠️  ${callbacks.getAppName()} does not appear to be signed. Please ensure that the application is intentionally unsigned.`
    )
  }

  return true
}

/**
 * Electron's directives: the shared policy (assets/utils/csp.ts) plus the dev server and
 * services in connect-src. Inline scripts are allowed by hash in production; without a
 * hash (dev) they fall back to 'unsafe-inline'.
 */
export function electronCSPDirectives(
  devServerUrl?: string,
  serviceUrls: string[] = [],
  scriptHash?: string
): CSPDirectives {
  return buildCSP({
    connect: [...(devServerUrl ? [devServerUrl, 'ws:'] : []), ...serviceUrls],
    scriptHashes: scriptHash ? [scriptHash] : [],
    allowInlineScripts: !scriptHash,
  })
}

/**
 * Setup Content Security Policy via the runtime session adapter.
 *
 * @param setupCSP - Runtime session setupCSP function
 * @param cspSetting - User override: string to use custom CSP, false to disable, undefined for default
 * @param devServerUrl - The Vite dev server URL (used to allow HMR connections in dev mode)
 * @param serviceUrls - URLs of resolved services to allow in connect-src
 * @param scriptHash - SHA-256 hash of inline script for production CSP (replaces 'unsafe-inline')
 */
export function setupContentSecurityPolicy(
  setupCSP: (csp: string) => void,
  cspSetting?: string | false | Record<string, string[]>,
  devServerUrl?: string,
  serviceUrls?: string[],
  scriptHash?: string
): void {
  const csp = resolveCSP(electronCSPDirectives(devServerUrl, serviceUrls, scriptHash), cspSetting)
  if (csp) setupCSP(csp) // null: the user disabled CSP
}

/**
 * Apply security settings to the app
 */
export function applySecuritySettings(securitySettings: ElectronSecuritySettings): void {
  // Note: app.enableSandbox() is intentionally NOT called here.
  // On Windows, app.enableSandbox() freezes the main process event loop when
  // BrowserWindow.loadURL() is called, preventing any page from loading.
  // Instead, sandbox is applied per-window via webPreferences.sandbox in
  // getWebPreferencesSecuritySettings(), which achieves the same isolation
  // without the Windows-specific freeze.
  // Apply other security settings as needed
  // Most security settings are applied per-window via webPreferences
}

/**
 * Get security settings for webPreferences
 * Filters only the settings that should be applied to BrowserWindow webPreferences
 */
export function getWebPreferencesSecuritySettings(
  securitySettings: ElectronSecuritySettings
): Partial<ElectronSecuritySettings> {
  const webPreferencesSecuritySettings = [
    'sandbox',
    'devTools',
    'contextIsolation',
    'nodeIntegration',
  ]

  return Object.entries(securitySettings).reduce((acc, [key, value]) => {
    if (webPreferencesSecuritySettings.includes(key)) {
      acc[key] = value
    }
    return acc
  }, {} as Partial<ElectronSecuritySettings>)
}

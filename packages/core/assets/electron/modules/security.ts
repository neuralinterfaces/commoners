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

import electron, { app, session, Session } from 'electron'
import { ElectronSecuritySettings } from '../../../types'
import { hasSignature, verifySignature, verifyAsarIntegrity } from '../security'
import { getDefaultSecuritySettings } from './config'

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
export async function runVerification(isProduction: boolean): Promise<boolean> {
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
      electron.dialog.showErrorBox(
        `${app.getName()} Integrity Check Failed`,
        `${messageBase}\n\nPlease contact support or reinstall the application.`
      )

      // Exit with error message
      if (globalThis.COMMONERS_QUIT) {
        globalThis.COMMONERS_QUIT(messageBase)
      } else {
        app.quit()
      }

      return false
    }
  } else {
    console.warn(
      `⚠️  ${app.getName()} does not appear to be signed. Please ensure that the application is intentionally unsigned.`
    )
  }

  return true
}

/**
 * Build the default CSP directive string.
 * Allows self, inline styles (required for Vite CSS injection), and WASM evaluation.
 * In production, replaces 'unsafe-inline' in script-src with a sha256 hash of the
 * inline script. In dev mode, keeps 'unsafe-inline' because HMR changes script content.
 */
function buildDefaultCSP(devServerUrl?: string, serviceUrls?: string[], scriptHash?: string): string {
  const connectSources = ["'self'"]
  if (devServerUrl) connectSources.push(devServerUrl, 'ws:')
  if (serviceUrls) connectSources.push(...serviceUrls)

  // Use hash instead of 'unsafe-inline' in script-src when available (production)
  const scriptInline = scriptHash || "'unsafe-inline'"

  return [
    "default-src 'self'",
    `script-src 'self' ${scriptInline} 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources.join(' ')}`,
    "img-src 'self' data:",
    "font-src 'self'",
  ].join('; ')
}

/**
 * Setup Content Security Policy for the session.
 *
 * @param sessionInstance - The Electron session to apply CSP to
 * @param cspSetting - User override: string to use custom CSP, false to disable, undefined for default
 * @param devServerUrl - The Vite dev server URL (used to allow HMR connections in dev mode)
 * @param serviceUrls - URLs of resolved services to allow in connect-src
 * @param scriptHash - SHA-256 hash of inline script for production CSP (replaces 'unsafe-inline')
 */
export function setupContentSecurityPolicy(
  sessionInstance: Session,
  cspSetting?: string | false,
  devServerUrl?: string,
  serviceUrls?: string[],
  scriptHash?: string
): void {
  // User explicitly disabled CSP
  if (cspSetting === false) return

  const csp = typeof cspSetting === 'string' ? cspSetting : buildDefaultCSP(devServerUrl, serviceUrls, scriptHash)

  sessionInstance.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
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

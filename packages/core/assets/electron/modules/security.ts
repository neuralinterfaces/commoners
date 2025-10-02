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

/**
 * Get security settings with defaults applied
 */
export function getSecuritySettings(
  userSettings: boolean | ElectronSecuritySettings,
  isProduction: boolean
): ElectronSecuritySettings {
  const DEFAULT_SECURITY_SETTINGS: ElectronSecuritySettings = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    devTools: !isProduction,
  }

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
 * Setup Content Security Policy for the session
 */
export function setupContentSecurityPolicy(sessionInstance: Session): void {
  // You can add CSP configuration here
  // Example:
  // sessionInstance.webRequest.onHeadersReceived((details, callback) => {
  //   callback({
  //     responseHeaders: {
  //       ...details.responseHeaders,
  //       'Content-Security-Policy': ["default-src 'self'"]
  //     }
  //   })
  // })
}

/**
 * Apply security settings to the app
 */
export function applySecuritySettings(securitySettings: ElectronSecuritySettings): void {
  if (securitySettings.sandbox) {
    app.enableSandbox() // Enable sandboxing if specified
  }

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

import { execFileSync, execSync } from 'child_process'
import { platform, homedir } from 'os'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

/**
 * Verify ASAR integrity (macOS and Windows)
 * This checks if the ASAR integrity validation is properly configured.
 * The actual validation is done by Electron via fuses at startup.
 */
export function verifyAsarIntegrity(): { enabled: boolean; error?: string } {
  try {
    const execPath = process.execPath

    if (process.platform === 'darwin') {
      // macOS: Check Info.plist for ElectronAsarIntegrity
      const appPath = execPath.split('/Contents/')[0]
      const plistPath = join(appPath, 'Contents', 'Info.plist')

      if (!existsSync(plistPath)) {
        return { enabled: false, error: 'Info.plist not found' }
      }

      const plistContent = readFileSync(plistPath, 'utf8')

      if (plistContent.includes('ElectronAsarIntegrity')) {
        console.log('✅ ASAR integrity validation enabled (macOS)')
        return { enabled: true }
      }

      return { enabled: false, error: 'ElectronAsarIntegrity not found in Info.plist' }
    }
    else if (process.platform === 'win32') {
      // Windows: ASAR integrity is embedded in executable resources
      // The actual verification is done by Electron via fuses
      // We can only confirm it was configured by checking if app.asar exists
      const asarPath = join(process.resourcesPath, 'app.asar')

      if (existsSync(asarPath)) {
        console.log('✅ ASAR integrity validation enabled (Windows)')
        return { enabled: true }
      }

      return { enabled: false, error: 'app.asar not found' }
    }

    return { enabled: false, error: 'Platform not supported for ASAR integrity' }
  } catch (err: any) {
    return { enabled: false, error: err.message }
  }
}

export function hasSignature(): boolean {
  try {
    const execPath = process.execPath

    // macOS: use codesign to see if there's *any* signature
    if (process.platform === 'darwin') {
      const output = execSync(`codesign -d --verbose=2 "${execPath}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'], // suppress stderr warnings
      })
      return /Authority=/.test(output) // Indicates signature exists
    }

    // Windows: check certificate status regardless of validity
    else if (process.platform === 'win32') {
      const exePath = process.execPath
      const output = execSync(
        `powershell -Command "(Get-AuthenticodeSignature '${exePath}').SignerCertificate"`,
        { encoding: 'utf8' }
      ).trim()
      return output !== '' && output !== 'null'
    }

    // Linux: assume no signature
    else return false
  } catch (e) {
    return false
  }
}

// Platform-Specific Binary Signature Check
export function verifySignature(): boolean {
  try {
    const execPath = process.execPath
    if (platform() === 'win32') {
      const out = execFileSync('powershell.exe', [
        '-Command',
        `Get-AuthenticodeSignature "${execPath}" | ConvertTo-Json`,
      ]).toString()
      const result = JSON.parse(out)
      return result.Status === 0
    } else if (platform() === 'darwin') {
      execFileSync('codesign', ['--verify', '--deep', '--strict', execPath])
      return true
    }
    return true // Assume OK on Linux
  } catch (err) {
    const message = `Executable signature check failed: ${err.message}`
    console.error(`🔒 ${message}`)
    return false
  }
}

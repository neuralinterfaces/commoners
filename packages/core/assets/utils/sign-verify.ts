/**
 * Platform-aware code signature verification.
 *
 * Verifies that a binary is signed by an expected publisher. Used to gate
 * service spawning at runtime — replaces byte-hash comparison, which can't
 * survive the build pipeline (signtool/codesign mutate the bytes after the
 * hash is computed).
 *
 * Trust model:
 *   - The expected publisher is declared at build time and sealed inside
 *     app.asar (via Electron's ASAR integrity fuses), so an attacker who
 *     can write to the resources directory cannot redirect the trust.
 *   - At runtime we ask the OS to verify the binary's actual signature.
 *     The OS checks the certificate chain, revocation status, and the
 *     signing identity. We then assert the identity matches the sealed
 *     expected publisher.
 *
 * Platforms:
 *   - Windows: PowerShell Get-AuthenticodeSignature → checks Status==Valid
 *     and the leaf cert subject contains the expected publisher.
 *   - macOS: codesign --verify (signature valid) + codesign --display
 *     (Authority chain matches expected publisher).
 *   - Linux / other: no native code signing — verification is skipped and
 *     reported as { valid: true, skipped: true }. Callers may decide whether
 *     to enforce on those platforms via other mechanisms.
 */

import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'

export type SignatureVerifyResult = {
  valid: boolean
  /** Signer subject as reported by the OS, if available. */
  signer?: string
  /** True when the platform doesn't support code-signing verification. */
  skipped?: boolean
  /** Human-readable failure reason. */
  error?: string
}

/**
 * Verify the OS-level code signature of a binary against an expected publisher.
 *
 * @param filepath  Absolute path to the binary
 * @param expectedPublisher  Substring to match in the leaf cert subject (case-insensitive).
 *                           If omitted, only validity is checked.
 */
export function verifySignature(
  filepath: string,
  expectedPublisher?: string
): SignatureVerifyResult {
  const plat = platform()
  if (plat === 'win32') return verifyWindowsAuthenticode(filepath, expectedPublisher)
  if (plat === 'darwin') return verifyMacCodesign(filepath, expectedPublisher)
  return { valid: true, skipped: true }
}

function verifyWindowsAuthenticode(
  filepath: string,
  expectedPublisher?: string
): SignatureVerifyResult {
  // Use Get-AuthenticodeSignature and emit a single line: "STATUS|<status>|<subject>".
  // PowerShell handles the heavy lifting (cert chain, revocation, etc.).
  // Inline the path inside a single-quoted PowerShell literal — passing it as a
  // trailing argv via `-Command "<script>" <path>` doesn't work because PS treats
  // the trailing token as a parameter to the cmdlet, not a script $args entry.
  // Escape any embedded single quotes by doubling them (PS literal escape).
  const escapedPath = filepath.replace(/'/g, "''")
  const psScript = [
    `$ErrorActionPreference = 'Stop'`,
    `$sig = Get-AuthenticodeSignature -FilePath '${escapedPath}'`,
    `$status = $sig.Status.ToString()`,
    `$subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }`,
    `Write-Output ("STATUS|" + $status + "|" + $subject)`,
  ].join('; ')

  let out: string
  try {
    out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (e: any) {
    return { valid: false, error: `PowerShell verification failed: ${e?.message ?? String(e)}` }
  }

  const match = /^STATUS\|([^|]+)\|(.*)$/.exec(out)
  if (!match) {
    return { valid: false, error: `Unexpected verifier output: ${out}` }
  }
  const status = match[1]
  const subject = match[2].trim()

  if (status !== 'Valid') {
    return { valid: false, signer: subject || undefined, error: `Signature status: ${status}` }
  }

  if (expectedPublisher && !subjectMatches(subject, expectedPublisher)) {
    return {
      valid: false,
      signer: subject,
      error: `Signature publisher mismatch: expected "${expectedPublisher}", got "${subject}"`,
    }
  }

  return { valid: true, signer: subject }
}

function verifyMacCodesign(filepath: string, expectedPublisher?: string): SignatureVerifyResult {
  // Step 1: validity (this fails if the binary isn't signed or signature is invalid)
  try {
    execFileSync('codesign', ['--verify', '--strict', filepath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e: any) {
    const stderr = e?.stderr?.toString?.() ?? ''
    return { valid: false, error: stderr.trim() || e?.message || 'codesign --verify failed' }
  }

  if (!expectedPublisher) return { valid: true }

  // Step 2: read signing authority chain
  let detail: string
  try {
    // codesign emits to stderr with --verbose; capture both
    detail = execFileSync('codesign', ['--display', '--verbose=4', filepath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e: any) {
    detail = (e?.stdout?.toString?.() ?? '') + (e?.stderr?.toString?.() ?? '')
    if (!detail) {
      return { valid: false, error: e?.message || 'codesign --display failed' }
    }
  }

  const authorities = (detail.match(/^Authority=.+$/gm) ?? []).map(line =>
    line.replace(/^Authority=/, '').trim()
  )
  const matched = authorities.find(a => subjectMatches(a, expectedPublisher))
  if (!matched) {
    return {
      valid: false,
      signer: authorities[0],
      error: `Signature authority mismatch: expected "${expectedPublisher}", got [${authorities.join(', ')}]`,
    }
  }
  return { valid: true, signer: matched }
}

/** Case-insensitive substring match — tolerant of cert subject formatting. */
function subjectMatches(subject: string, expected: string): boolean {
  return subject.toLowerCase().includes(expected.toLowerCase())
}

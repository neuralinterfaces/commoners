/* eslint-disable no-console */
import { join, basename, dirname, extname, normalize, sep } from 'node:path'
import {
  existsSync,
  readdirSync,
  lstatSync,
  statSync,
  readFileSync,
  writeFileSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import plist from 'plist'
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'
import { logAsarState } from './debug.js'

/* ---------------- tiny utils ---------------- */
const log = (...a: any[]) => console.log('[asar-integrity]', ...a)
const warn = (...a: any[]) => console.warn('[asar-integrity]', ...a)
const error = (...a: any[]) => console.error('[asar-integrity]', ...a)
const isWin = () => process.platform === 'win32'
const isMac = () => process.platform === 'darwin'

function sha256(buf: Buffer | Uint8Array) {
  return createHash('sha256').update(buf).digest('hex')
}

/* ---------------- locate main exe ---------------- */
function findExe(appOutDir: string, preferredBase?: string): string {
  if (preferredBase) {
    const p = join(appOutDir, `${preferredBase}.exe`)
    if (existsSync(p)) return p
  }
  const exeNames = readdirSync(appOutDir).filter(n => /\.exe$/i.test(n))
  if (!exeNames.length) throw new Error(`No .exe found in ${appOutDir}`)
  let best = join(appOutDir, exeNames[0]),
    max = 0
  for (const n of exeNames) {
    const p = join(appOutDir, n)
    try {
      const s = statSync(p)
      if (s.size > max) {
        max = s.size
        best = p
      }
    } catch {}
  }
  return best
}

export const debugAfterPack = async (context: any) => {
  const buildConfig = context.packager?.info?.options || {}
  if (!buildConfig) {
    console.warn('⚠️ No build configuration found in context.packager.info.options')
    return
  }

  console.log('🔍 AfterPack Debug:', {
    appOutDir: context.appOutDir,
    productName: buildConfig.productName,
    platform: process.platform,
    electronVersion: buildConfig.electronVersion,
  })

  // Check if ASAR exists
  const asarPath =
    process.platform === 'darwin'
      ? join(
          context.appOutDir,
          `${buildConfig.productName}.app`,
          'Contents',
          'Resources',
          'app.asar'
        )
      : join(context.appOutDir, 'resources', 'app.asar')

  console.log('📦 ASAR Check:', {
    asarPath,
    exists: existsSync(asarPath),
    size: existsSync(asarPath) ? lstatSync(asarPath).size : 'N/A',
  })

  // Log initial ASAR state for debugging
  logAsarState('DEBUG_AFTER_PACK', asarPath, { hook: 'debugAfterPack' })
}

/* ---------------- read ASAR header bytes ---------------- */
// JSON header bytes (what @electron/asar.getRawHeader() returns)
function readJsonHeaderBytes(asarPath: string): Buffer | null {
  let fd = -1
  try {
    fd = openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null
    const len0 = pre.readUInt32LE(0)
    const headerSize = pre.readUInt32LE(4)
    const jsonLen = pre.readUInt32LE(8)
    if (len0 !== 4 || headerSize !== 4 + jsonLen || jsonLen <= 0) return null
    const json = Buffer.allocUnsafe(jsonLen)
    if (readSync(fd, json, 0, jsonLen, 12) !== jsonLen) return null
    return json
  } catch (e) {
    warn('Error reading ASAR JSON header:', e)
    return null
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

// FULL header (12-byte prelude + JSON) for fallback on certain Electron builds
function readFullHeaderBytes(asarPath: string): Buffer | null {
  let fd = -1
  try {
    fd = openSync(asarPath, 'r')
    const pre = Buffer.allocUnsafe(12)
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null
    const jsonLen = pre.readUInt32LE(8)
    if (jsonLen <= 0) return null
    const full = Buffer.allocUnsafe(12 + jsonLen)
    pre.copy(full, 0, 0, 12)
    if (readSync(fd, full, 12, jsonLen, 12) !== jsonLen) return null
    return full
  } catch (e) {
    warn('Error reading ASAR full header:', e)
    return null
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

/* ---------------- Dependency checking and validation ---------------- */
interface DependencyStatus {
  ffiAvailable: boolean
  rceditAvailable: boolean
  ffiError?: string
  rceditError?: string
}

function checkDependencies(): DependencyStatus {
  const status: DependencyStatus = {
    ffiAvailable: false,
    rceditAvailable: false,
  }

  // Check FFI dependencies
  if (isWin()) {
    try {
      require('ffi-napi')
      require('ref-napi')
      status.ffiAvailable = true
    } catch (e: any) {
      status.ffiError = e.message
    }

    // Check rcedit
    try {
      require('rcedit')
      status.rceditAvailable = true
    } catch (e: any) {
      status.rceditError = e.message
    }
  }

  return status
}

function validateDependenciesForIntegrity(): boolean {
  if (!isWin()) return true // Only needed for Windows

  const deps = checkDependencies()

  if (!deps.ffiAvailable && !deps.rceditAvailable) {
    const errorMsg = [
      '',
      '❌ ASAR INTEGRITY SETUP ERROR',
      '=====================================',
      'Required dependencies for Windows ASAR integrity are missing:',
      '',
      'FFI libraries (preferred method):',
      `  Error: ${deps.ffiError || 'Unknown error'}`,
      '  Install with: npm install ffi-napi ref-napi',
      '',
      'rcedit (fallback method):',
      `  Error: ${deps.rceditError || 'Unknown error'}`,
      '  Install with: npm install rcedit',
      '',
      'At least one of these methods must be available to embed ASAR integrity data.',
      'Without this, your Electron app will fail to start with integrity validation enabled.',
      '',
      'RECOMMENDED SOLUTION:',
      '1. Install dependencies: npm install ffi-napi ref-napi rcedit',
      '2. If FFI installation fails, ensure you have:',
      '   - Visual Studio Build Tools',
      '   - Python (for node-gyp)',
      '   - Windows SDK',
      '3. Rebuild your application',
      '',
      'ALTERNATIVE:',
      'Disable ASAR integrity by setting electron.secure = false in your config',
      '=====================================',
      '',
    ].join('\n')

    warn(errorMsg)
    return false // Don't throw, just return false
  }

  if (!deps.ffiAvailable) {
    warn('FFI libraries not available, will use rcedit fallback method')
    warn(`FFI error: ${deps.ffiError}`)
    warn(
      'For better performance and verification, consider installing: npm install ffi-napi ref-napi'
    )
  }

  if (!deps.rceditAvailable) {
    warn('rcedit not available as fallback method')
    warn(`rcedit error: ${deps.rceditError}`)
  }

  // Log successful setup
  if (deps.ffiAvailable) {
    log('✅ FFI libraries available - using preferred integrity embedding method')
  } else if (deps.rceditAvailable) {
    log('✅ rcedit available - using fallback integrity embedding method')
  }

  return true
}

/* ---------------- Win32 resource I/O with FFI fallback to rcedit ---------------- */
let K: any = null
let ffiAvailable = false

// Try to load FFI on Windows (with detailed error checking)
if (isWin()) {
  try {
    const ffi = require('ffi-napi')
    const ref = require('ref-napi')

    K = ffi.Library('Kernel32', {
      GetLastError: ['uint32', []],
      BeginUpdateResourceW: ['pointer', ['pointer', 'bool']],
      UpdateResourceW: ['bool', ['pointer', 'pointer', 'pointer', 'uint16', 'pointer', 'uint32']],
      EndUpdateResourceW: ['bool', ['pointer', 'bool']],
      LoadLibraryExW: ['pointer', ['pointer', 'pointer', 'uint32']],
      FindResourceExW: ['pointer', ['pointer', 'pointer', 'pointer', 'uint16']],
      SizeofResource: ['uint32', ['pointer', 'pointer']],
      LoadResource: ['pointer', ['pointer', 'pointer']],
      LockResource: ['pointer', ['pointer']],
      FreeLibrary: ['bool', ['pointer']],
    })

    ffiAvailable = true
  } catch (e: any) {
    ffiAvailable = false
    // Error will be handled by validateDependenciesForIntegrity
  }
}

function wstr(s: string) {
  return Buffer.from(s + '\u0000', 'ucs2')
}

function lastErr() {
  return K?.GetLastError() || 0
}

// FFI-based resource writing with improved error handling
function writeIntegrityResourceFFI(exePath: string, payloadJson: string) {
  if (!isWin() || !ffiAvailable || !K) {
    throw new Error('FFI not available for Windows resource writing')
  }

  const exeW = wstr(exePath)
  const typeW = wstr('Integrity')
  const nameW = wstr('ElectronAsar')
  const data = Buffer.from(payloadJson, 'utf8')

  const h = K.BeginUpdateResourceW(exeW, false)
  if (!h || (h.isNull && h.isNull())) {
    throw new Error(`BeginUpdateResourceW failed (err=${lastErr()})`)
  }

  let ok = true
  let err = 0

  // Try multiple language IDs for better compatibility
  const languageIds = [1033, 0, 1024] // US English, Neutral, Default

  for (const lang of languageIds) {
    const r = K.UpdateResourceW(h, typeW, nameW, lang, data, data.length)
    if (!r) {
      const currentErr = lastErr()
      warn(`UpdateResourceW failed (lang=${lang}, err=${currentErr})`)
      if (ok) {
        // Only set error on first failure
        ok = false
        err = currentErr
      }
    } else {
      log(`UpdateResourceW OK (lang=${lang}, ${data.length} bytes)`)
      ok = true // At least one succeeded
      break // Exit on first success
    }
  }

  const end = K.EndUpdateResourceW(h, !ok)
  if (!end) {
    const endErr = lastErr()
    throw new Error(`EndUpdateResourceW failed (err=${endErr})`)
  }

  if (!ok) {
    throw new Error(`All UpdateResourceW attempts failed (last err=${err})`)
  }
}

// rcedit fallback for resource writing
async function writeIntegrityResourceRcedit(exePath: string, payloadJson: string) {
  if (!isWin()) return

  try {
    const rcedit = require('rcedit')

    // Use file version info as a more reliable storage method
    const existingVersionInfo = await rcedit(exePath, {}).catch(() => ({}))

    await rcedit(exePath, {
      'version-string': {
        ...existingVersionInfo,
        ElectronAsarIntegrity: payloadJson,
      },
    })

    log('rcedit integrity resource written successfully')
  } catch (e: any) {
    error('rcedit failed:', e.message)
    throw new Error(`rcedit failed: ${e.message}`)
  }
}

// Main resource writing function with fallbacks and retry logic
async function writeIntegrityResource(exePath: string, payloadJson: string) {
  if (!isWin()) return

  // Ensure the exe exists and is writable
  if (!existsSync(exePath)) {
    throw new Error(`Executable not found: ${exePath}`)
  }

  // Check dependencies again to provide specific error context
  const deps = checkDependencies()
  if (!deps.ffiAvailable && !deps.rceditAvailable) {
    throw new Error(
      'Cannot write integrity resource: both FFI and rcedit dependencies are missing. ' +
        'Install with: npm install ffi-napi ref-napi rcedit'
    )
  }

  // Wait a bit to ensure the file is fully written and not locked
  await new Promise(resolve => setTimeout(resolve, 100))

  let lastError: Error | null = null
  let ffiAttempted = false
  let rceditAttempted = false

  // Try FFI first with retry
  if (deps.ffiAvailable && ffiAvailable) {
    ffiAttempted = true
    log('Attempting FFI-based integrity embedding...')

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, attempt * 100)) // Progressive delay
        writeIntegrityResourceFFI(exePath, payloadJson)
        log(`✅ FFI resource writing succeeded on attempt ${attempt + 1}`)
        return
      } catch (e: any) {
        lastError = e
        warn(`FFI resource writing attempt ${attempt + 1} failed:`, e.message)
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 200)) // Wait before retry
        }
      }
    }
    warn('All FFI attempts failed, trying rcedit fallback...')
  }

  // Fallback to rcedit with retry
  if (deps.rceditAvailable) {
    rceditAttempted = true
    log('Attempting rcedit-based integrity embedding...')

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, attempt * 100)) // Progressive delay
        await writeIntegrityResourceRcedit(exePath, payloadJson)
        log(`✅ rcedit resource writing succeeded on attempt ${attempt + 1}`)
        return
      } catch (e: any) {
        lastError = e
        warn(`rcedit attempt ${attempt + 1} failed:`, e.message)
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 200)) // Wait before retry
        }
      }
    }
  }

  // Build comprehensive error message
  const errorDetails = [
    'All resource writing methods failed:',
    ffiAttempted
      ? `- FFI method: ${ffiAttempted ? 'ATTEMPTED' : 'SKIPPED'} (${deps.ffiAvailable ? 'available' : 'unavailable'})`
      : null,
    rceditAttempted
      ? `- rcedit method: ${rceditAttempted ? 'ATTEMPTED' : 'SKIPPED'} (${deps.rceditAvailable ? 'available' : 'unavailable'})`
      : null,
    `Last error: ${lastError?.message}`,
    '',
    'This means your Electron app will NOT have ASAR integrity validation.',
    'To fix this:',
    '1. Install missing dependencies: npm install ffi-napi ref-napi rcedit',
    '2. Ensure the executable is not running during build',
    '3. Check Windows permissions allow writing to the executable',
    '4. Try running the build as administrator if permission issues persist',
  ]
    .filter(Boolean)
    .join('\n')

  throw new Error(errorDetails)
}

// Fixed readIntegrityResource with better error handling and validation
export function readIntegrityResource(exePath: string) {
  if (!isWin() || !ffiAvailable || !K) return []

  try {
    // Validate the executable exists and is actually an executable
    if (!existsSync(exePath)) {
      warn(`Executable not found for integrity verification: ${exePath}`)
      return []
    }

    const stats = statSync(exePath)
    if (stats.size === 0) {
      warn(`Executable appears to be empty: ${exePath}`)
      return []
    }

    const ref = require('ref-napi')

    // More robust load flags - try them in order of preference
    const loadAttempts = [
      { flag: 0x00000002, name: 'LOAD_LIBRARY_AS_DATAFILE' },
      { flag: 0x00000020, name: 'LOAD_LIBRARY_AS_IMAGE_RESOURCE' },
      { flag: 0x00000022, name: 'LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE' },
      { flag: 0x00000000, name: 'Default (no flags)' },
    ]

    let mod = null
    let lastError = 0
    let successfulFlag = null

    for (const attempt of loadAttempts) {
      try {
        mod = K.LoadLibraryExW(wstr(exePath), ref.NULL, attempt.flag)
        lastError = lastErr()

        if (mod && !(mod.isNull && mod.isNull())) {
          successfulFlag = attempt.name
          log(`LoadLibraryExW succeeded with ${attempt.name}`)
          break
        }

        log(`LoadLibraryExW failed with ${attempt.name} (err=${lastError})`)
        mod = null
      } catch (e: any) {
        warn(`Exception during LoadLibraryExW with ${attempt.name}:`, e.message)
        mod = null
      }
    }

    if (!mod) {
      // Don't throw here - this is verification, not critical path
      warn(`All LoadLibraryExW attempts failed for ${basename(exePath)} (last err=${lastError})`)
      warn(
        'This may indicate the executable is corrupted, locked, or has an incompatible architecture'
      )
      return []
    }

    // Rest of the function remains the same...
    const typeW = wstr('Integrity')
    const nameW = wstr('ElectronAsar')
    const langs = [1033, 0, 1024]

    const out: Array<{ lang: number; found: boolean; json?: string; size?: number }> = []

    for (const lang of langs) {
      try {
        const hRes = K.FindResourceExW(mod, typeW, nameW, lang)
        if (!hRes || (hRes.isNull && hRes.isNull())) {
          out.push({ lang, found: false })
          continue
        }

        const size = K.SizeofResource(mod, hRes)
        const hMem = K.LoadResource(mod, hRes)
        const ptr = K.LockResource(hMem)
        let json: string | undefined

        if (ptr && !(ptr as any).isNull?.() && size > 0) {
          json = Buffer.from(ref.reinterpret(ptr, size)).toString('utf8')
        }

        out.push({ lang, found: true, json, size })
      } catch (e: any) {
        warn(`Error reading resource for language ${lang}:`, e.message)
        out.push({ lang, found: false })
      }
    }

    try {
      K.FreeLibrary(mod)
    } catch (e: any) {
      warn('Error freeing library:', e.message)
    }

    return out
  } catch (e: any) {
    warn('Error reading integrity resource:', e.message)
    return []
  }
}

/* ---------------- macOS plist ---------------- */
function writePlistIntegrity(infoPlistPath: string, headerHash: string) {
  try {
    const xml = readFileSync(infoPlistPath, 'utf8')
    const obj: any = plist.parse(xml) || {}
    obj.ElectronAsarIntegrity = obj.ElectronAsarIntegrity || {}
    // MUST be exactly this key with forward slashes
    obj.ElectronAsarIntegrity['Resources/app.asar'] = {
      algorithm: 'SHA256',
      hash: headerHash,
    }
    const out = plist.build(obj)
    writeFileSync(infoPlistPath, out, 'utf8')
  } catch (e: any) {
    error('Failed to write plist integrity:', e.message)
    throw e
  }
}

/* ---------------- helpers for artifact contexts ---------------- */
function isDir(p: string) {
  try {
    return existsSync(p) && lstatSync(p).isDirectory()
  } catch {
    return false
  }
}

function looksLikeInstallerExe(p: string) {
  const n = basename(p).toLowerCase()
  return (
    n.endsWith('.exe') && (n.includes('setup') || n.includes('installer') || n.includes('nsis'))
  )
}

function looksLikePortableExe(p: string) {
  const n = basename(p).toLowerCase()
  return n.endsWith('.exe') && n.includes('portable')
}

function findSiblingUnpackedDir(artifactFile: string): string | null {
  const root = dirname(artifactFile)

  // 1) root/win-unpacked
  const c1 = join(root, 'win-unpacked')
  if (isDir(c1)) return c1

  // 2) one level up sibling (dist/nsis/App Setup.exe -> dist/win-unpacked)
  const up = dirname(root)
  const c2 = join(up, 'win-unpacked')
  if (isDir(c2)) return c2

  // 3) scan immediate subdirs for *-unpacked that contain resources/app.asar
  for (const d of readdirSync(root)) {
    if (!/-unpacked$/i.test(d)) continue
    const cand = join(root, d)
    if (!isDir(cand)) continue
    const asar = join(cand, 'resources', 'app.asar')
    if (existsSync(asar)) return cand
  }

  // 4) fallback: scan siblings of parent
  for (const d of readdirSync(up)) {
    if (!/-unpacked$/i.test(d)) continue
    const cand = join(up, d)
    if (!isDir(cand)) continue
    const asar = join(cand, 'resources', 'app.asar')
    if (existsSync(asar)) return cand
  }

  return null
}

function findMacAppForArtifact(artifactFile: string): string | null {
  // If artifact IS the .app, return it; else search siblings
  if (artifactFile.toLowerCase().endsWith('.app') && isDir(artifactFile)) return artifactFile

  const root = dirname(artifactFile)
  const entries = readdirSync(root).filter(n => n.toLowerCase().endsWith('.app'))
  // Prefer the largest bundle (heuristic)
  let best: string | null = null,
    max = 0
  for (const n of entries) {
    const p = join(root, n)
    if (!isDir(p)) continue
    try {
      const rsrc = join(p, 'Contents', 'Resources', 'app.asar')
      if (!existsSync(rsrc)) continue
      const s = lstatSync(p)
      if (s.size > max) {
        max = s.size
        best = p
      }
    } catch {}
  }
  return best
}

/* ---------------- public hooks ---------------- */
/**
 * Embed ASAR integrity (Windows & macOS) in a robust way:
 *  1) Optionally run your asar patcher (mutateAsar) FIRST
 *  2) Hash JSON header; write resource/plist
 *  3) Verify by re-reading resource; if missing/mismatch on Win, retry with FULL header hash
 */
export type MutateAsarFn = (opts: {
  appOutDir: string
  productName: string
}) => Promise<void> | void

type ArtifactCtx = {
  file?: string
  target?: { name?: string } | null
  packager?: any
}

function logIntegritySetupStatus(): void {
  if (!isWin()) {
    log('Platform: Non-Windows - ASAR integrity validation not applicable')
    return
  }

  const deps = checkDependencies()

  log('=== ASAR Integrity Setup Status ===')
  log(`FFI Libraries: ${deps.ffiAvailable ? '✅ Available' : '❌ Missing'}`)
  if (!deps.ffiAvailable) {
    log(`  Error: ${deps.ffiError}`)
    log('  Install: npm install ffi-napi ref-napi')
  }

  log(`rcedit: ${deps.rceditAvailable ? '✅ Available' : '❌ Missing'}`)
  if (!deps.rceditAvailable) {
    log(`  Error: ${deps.rceditError}`)
    log('  Install: npm install rcedit')
  }

  if (deps.ffiAvailable || deps.rceditAvailable) {
    log('Status: ✅ Ready for ASAR integrity embedding')
  } else {
    log('Status: ❌ Cannot embed ASAR integrity - app will fail to start')
  }
  log('=====================================')
}

export function makeAfterPackEmbedAsarIntegrity(mutateAsar?: MutateAsarFn) {
  return async function afterPackOrArtifact(context: any & ArtifactCtx) {
    try {
      // Log current setup status for visibility
      logIntegritySetupStatus()

      // FIRST: Validate dependencies before attempting anything
      const hasValidDeps = validateDependenciesForIntegrity()
      if (!hasValidDeps) {
        warn('Skipping ASAR integrity embedding due to missing dependencies')
        return // Don't fail the build, just skip integrity
      }

      const isAfterPack = Boolean(context?.appOutDir)
      const packager = context?.packager
      const product = packager?.appInfo?.productFilename || packager?.appInfo?.productName

      // Resolve a writable app root and an asar path for both hooks
      let appRoot: string | null = null
      let asarPath: string | null = null
      let exeForWin: string | null = null
      const platformName = packager?.platform?.nodeName || process.platform

      if (isAfterPack) {
        // ----- afterPack shape -----
        const appOutDir = context.appOutDir
        if (!product) {
          warn('No product name found, skipping integrity embedding')
          return
        }

        appRoot = appOutDir
        asarPath = isMac()
          ? join(appRoot, `${product}.app`, 'Contents', 'Resources', 'app.asar')
          : join(appRoot, 'resources', 'app.asar')

        if (isWin()) {
          exeForWin = findExe(appRoot, product)
        }
      } else {
        // ----- artifactBuildCompleted shape -----
        const file = context?.file
        if (!file || !product) {
          warn('artifactBuildCompleted: missing file or product; skipping')
          return
        }

        const ext = extname(file).toLowerCase()

        if (platformName === 'darwin' || process.platform === 'darwin' || ext === '.app') {
          // Handle .app bundles directly
          const appBundle = findMacAppForArtifact(file)
          if (!appBundle) {
            warn('macOS artifact: no .app bundle found to modify; skipping')
            return
          }
          appRoot = dirname(appBundle) // root that contains the .app
          asarPath = join(appBundle, 'Contents', 'Resources', 'app.asar')
          // Mac path doesn't need exeForWin
        } else if (process.platform === 'win32' || platformName === 'win32' || ext === '.exe') {
          if (looksLikePortableExe(file)) {
            // Portable EXE => can write the resource directly into the artifact
            appRoot = dirname(file)
            asarPath = join(appRoot, 'resources', 'app.asar') // portable structure
            exeForWin = file // write into portable exe
          } else if (looksLikeInstallerExe(file) || context?.target?.name === 'nsis') {
            // NSIS installer; find the unpacked dir if present
            const unpacked = findSiblingUnpackedDir(file)
            if (!unpacked) {
              warn(
                "Windows installer artifact: could not locate 'win-unpacked'; will skip embedding (installer already built)."
              )
              return
            }
            appRoot = unpacked
            asarPath = join(unpacked, 'resources', 'app.asar')
            exeForWin = findExe(unpacked, product)
            warn(
              "Windows NSIS artifact: embedding into 'win-unpacked' will not affect this already-created installer."
            )
          } else {
            // Unknown exe type; best-effort: try sibling *-unpacked
            const unpacked = findSiblingUnpackedDir(file)
            if (unpacked) {
              appRoot = unpacked
              asarPath = join(unpacked, 'resources', 'app.asar')
              exeForWin = findExe(unpacked, product)
              warn(
                "Windows artifact: updated sibling '*-unpacked' directory; current artifact unchanged."
              )
            } else {
              warn(
                `Windows artifact '${basename(file)}' is not a portable app and has no unpacked sibling; skipping.`
              )
              return
            }
          }
        } else {
          // DMG/ZIP/AppImage/etc. — skip (read-only/archives)
          warn(
            `Artifact '${basename(file)}' is an archive/readonly format; skipping integrity embedding.`
          )
          return
        }
      }

      if (!asarPath || !existsSync(asarPath)) {
        warn(`ASAR file not found at ${asarPath || '<unknown>'}, skipping integrity embedding`)
        return
      }

      log(`Starting ASAR integrity embedding for ${product}`)
      log(`Found ASAR at: ${asarPath}`)
      log(`Target executable: ${exeForWin || 'N/A (macOS)'}`)

      // Track initial state
      const initialState = logAsarState('INITIAL_STATE', asarPath, {
        hookType: isAfterPack ? 'afterPack' : 'artifactBuildCompleted',
        product,
        exeForWin,
      })

      // Optionally mutate when the app folder is writable
      if (mutateAsar && appRoot && isDir(appRoot)) {
        try {
          logAsarState('BEFORE_MUTATION', asarPath)
          await mutateAsar({ appOutDir: appRoot, productName: product })
          logAsarState('AFTER_MUTATION', asarPath)
          log('mutateAsar completed successfully')
        } catch (e: any) {
          warn('mutateAsar failed:', e?.message || e)
        }
      }

      // Track before hashing
      logAsarState('BEFORE_HASHING', asarPath)

      // 1) hash JSON header
      const jsonHeader = readJsonHeaderBytes(asarPath)
      if (!jsonHeader?.length) {
        warn('ASAR JSON header unreadable; skipping')
        return
      }
      const jsonHash = sha256(jsonHeader)

      // Debug: Log ASAR file info
      const asarStats = lstatSync(asarPath)
      log('ASAR Debug Info:', {
        path: asarPath,
        size: asarStats.size,
        mtime: asarStats.mtime.toISOString(),
        jsonHeaderSHA256: jsonHash,
        hookType: isAfterPack ? 'afterPack' : 'artifactBuildCompleted',
      })

      logAsarState('AFTER_READING_HEADER', asarPath, { jsonHash })

      // 2) write platform-specific pointer
      if (isMac() || packager?.platform?.nodeName === 'darwin') {
        // We must know the .app path to write Info.plist
        const appBundle = asarPath.split('/Contents/Resources/app.asar')[0]
        const plistPath = join(appBundle, 'Contents', 'Info.plist')
        if (!existsSync(plistPath)) {
          warn('Info.plist not found:', plistPath)
          return
        }
        writePlistIntegrity(plistPath, jsonHash)
        log('✅ Wrote ElectronAsarIntegrity → Info.plist')
        return
      }

      if (isWin() || packager?.platform?.nodeName === 'win32') {
        if (!exeForWin) {
          if (appRoot) exeForWin = findExe(appRoot, product)
        }
        if (!exeForWin) {
          warn('Windows: no executable found to embed integrity; skipping')
          return
        }

        log(`Found executable at: ${exeForWin}`)

        // CRITICAL: Use consistent path separators - Windows Electron expects backslashes
        const normalizedAsarPath = normalize(asarPath).replace(/\//g, '\\')
        const relativePath = normalizedAsarPath.includes('\\resources\\app.asar')
          ? 'resources\\app.asar'
          : 'app.asar'

        const payload = (h: string) =>
          JSON.stringify([{ file: relativePath, alg: 'sha256', value: h }])

        log(`Using ASAR path in payload: ${relativePath}`)

        logAsarState('BEFORE_RESOURCE_WRITE', asarPath)

        // write JSON-hash payload first
        try {
          await writeIntegrityResource(exeForWin, payload(jsonHash))
          log('Resource writing completed')
        } catch (e: any) {
          // Don't fail the build if integrity embedding fails
          warn('Failed to write integrity resource:', e.message)
          warn('Continuing build without ASAR integrity validation')
          return
        }

        logAsarState('AFTER_RESOURCE_WRITE', asarPath)

        // verify by native readback if FFI is available
        if (ffiAvailable) {
          // Wait a moment for the resource to be written
          await new Promise(resolve => setTimeout(resolve, 200))

          logAsarState('BEFORE_VERIFICATION', asarPath)

          try {
            const hits = readIntegrityResource(exeForWin)
            const first = hits.find(h => h.found && h.json)

            if (first) {
              try {
                const arr = JSON.parse(first.json!)
                const rec =
                  Array.isArray(arr) &&
                  arr.find(
                    (x: any) =>
                      x && /resources\\app\.asar|app\.asar/i.test(x.file) && x.alg === 'sha256'
                  )
                const embedded = rec && String(rec.value || '').toLowerCase()

                if (embedded === jsonHash) {
                  log('✅ Embedded JSON header hash verified')
                  logAsarState('AFTER_SUCCESSFUL_VERIFICATION', asarPath, {
                    verifiedHash: embedded,
                  })
                  return
                }

                warn(`Embedded hash mismatch: expected ${jsonHash}, got ${embedded}`)
                warn('Trying FULL header hash fallback…')
              } catch (e: any) {
                warn('Error parsing embedded integrity data:', e.message)
              }
            } else {
              warn('Integrity resource not found after write, trying FULL header fallback')
            }

            logAsarState('BEFORE_FULL_HEADER_FALLBACK', asarPath)

            // Fallback to full header
            const fullHeader = readFullHeaderBytes(asarPath)
            if (!fullHeader) {
              warn('FULL ASAR header unreadable, skipping verification fallback')
              return
            }

            const fullHash = sha256(fullHeader)
            log(`Trying full header hash: ${fullHash}`)

            try {
              await writeIntegrityResource(exeForWin, payload(fullHash))

              logAsarState('AFTER_FULL_HEADER_WRITE', asarPath, { fullHash })

              // Verify full header embedding
              await new Promise(resolve => setTimeout(resolve, 200))
              const hits2 = readIntegrityResource(exeForWin)
              const first2 = hits2.find(h => h.found && h.json)
              let embedded2: string | null = null

              try {
                const arr2 = JSON.parse(first2?.json || '[]')
                const rec2 =
                  Array.isArray(arr2) &&
                  arr2.find(
                    (x: any) =>
                      x && /resources\\app\.asar|app\.asar/i.test(x.file) && x.alg === 'sha256'
                  )
                embedded2 = rec2 && String(rec2.value || '').toLowerCase()
              } catch {}

              if (embedded2 !== fullHash) {
                warn(
                  `Failed to verify Windows integrity resource. Expected: ${fullHash}, got: ${embedded2}`
                )
                warn('Continuing build without verified integrity')
                return
              }

              log('✅ Embedded FULL header hash verified')

              // Final verification: re-read the ASAR to make sure it hasn't changed
              await new Promise(resolve => setTimeout(resolve, 1000)) // Wait longer

              logAsarState('FINAL_VERIFICATION_BEFORE', asarPath)

              const finalJsonHeader = readJsonHeaderBytes(asarPath)
              const finalJsonHash = finalJsonHeader ? sha256(finalJsonHeader) : null
              const finalFullHeader = readFullHeaderBytes(asarPath)
              const finalFullHash = finalFullHeader ? sha256(finalFullHeader) : null

              log('Final ASAR verification:', {
                originalJsonHash: jsonHash,
                finalJsonHash,
                originalFullHash: fullHash,
                finalFullHash,
                jsonHashMatch: finalJsonHash === jsonHash,
                fullHashMatch: finalFullHash === fullHash,
                embeddedHash: embedded2,
              })

              logAsarState('FINAL_VERIFICATION_AFTER', asarPath, {
                originalJsonHash: jsonHash,
                finalJsonHash,
                originalFullHash: fullHash,
                finalFullHash,
                jsonHashMatch: finalJsonHash === jsonHash,
                fullHashMatch: finalFullHash === fullHash,
              })

              if (finalFullHash !== fullHash) {
                error(`CRITICAL: ASAR file was modified after integrity embedding!`)
                error(`Original hash: ${fullHash}`)
                error(`Current hash: ${finalFullHash}`)
                error(`This will cause the app to fail at startup.`)
              }
            } catch (e: any) {
              warn('Failed to write full header fallback:', e.message)
              warn('Continuing build without verified integrity')
            }
          } catch (e: any) {
            warn('Error during integrity verification:', e.message)
            warn('Continuing build - verification failed but resource may still be embedded')
          }
        } else {
          log('✅ Integrity resource written (verification skipped - FFI not available)')
          logAsarState('VERIFICATION_SKIPPED', asarPath)
        }
      }
    } catch (e: any) {
      // Don't throw - log the error but allow build to continue
      warn('ASAR integrity embedding failed:', e.message)
      warn('Build will continue without ASAR integrity validation')
      warn('To fix this issue, install dependencies: npm install ffi-napi ref-napi rcedit')
    }
  }
}

/** Flip fuses AFTER embedding integrity pointers. */
export async function afterPackFlipFuses(context: any) {
  try {
    const { appOutDir, packager } = context
    const product = packager?.appInfo?.productFilename || packager?.appInfo?.productName

    if (!product) {
      warn('No product name found for fuse flipping')
      return
    }

    // Track ASAR state before fuse flipping
    const asarPath = join(appOutDir, 'resources', 'app.asar')
    logAsarState('BEFORE_FUSE_FLIP', asarPath, { hook: 'afterPackFlipFuses' })

    const targetPath = isWin()
      ? findExe(appOutDir, product)
      : isMac()
        ? join(appOutDir, `${product}.app`)
        : appOutDir

    log(`Flipping fuses for: ${targetPath}`)

    await flipFuses(targetPath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    })

    // Track ASAR state after fuse flipping
    logAsarState('AFTER_FUSE_FLIP', asarPath, { hook: 'afterPackFlipFuses' })

    log('✅ Fuses flipped successfully on', targetPath)
  } catch (e: any) {
    warn('Fuse flip failed:', e?.message || e)
    // Don't throw - fuse flipping failure shouldn't break the build
  }
}

/** Generic hook chainer that works for any electron-builder hook */
function createHookChainer(hookName: string) {
  return function (
    existing: ((ctx: any) => any) | string | undefined,
    ...fns: Array<(ctx: any) => any | Promise<any>>
  ) {
    return async (ctx: any) => {
      // First, run the existing hook if it exists
      if (existing) {
        try {
          if (typeof existing === 'string') {
            // Load and execute the script file
            const scriptPath = existing
            const { createRequire } = await import('module').then((mod: any) => mod.default || mod)
            const require = createRequire(import.meta.url || __filename)

            // Try to require the script
            const scriptModule = require(scriptPath)

            // Handle different export patterns
            const hookFunction = scriptModule.default || scriptModule

            if (typeof hookFunction === 'function') {
              await hookFunction(ctx)
              log(`Executed string-based ${hookName} hook: ${scriptPath}`)
            } else {
              warn(`String-based ${hookName} hook at "${scriptPath}" did not export a function`)
            }
          } else if (typeof existing === 'function') {
            await existing(ctx)
          }
        } catch (e: any) {
          error(`Existing ${hookName} hook failed: ${e.message}`)
          throw e
        }
      }

      // Then run all the new functions
      for (const fn of fns) {
        try {
          await fn(ctx)
        } catch (e: any) {
          error(`${hookName} hook failed: ${e.message}`)
          throw e
        }
      }
    }
  }
}

/** Chain multiple `afterPack` hooks safely. */
export const chainAfterPack = createHookChainer('afterPack')

/** Chain multiple `afterSign` hooks safely. */
export const chainAfterSign = createHookChainer('afterSign')

/** Chain multiple `artifactBuildCompleted` hooks safely. */
export const chainArtifactBuildCompleted = createHookChainer('artifactBuildCompleted')

/** Chain multiple `beforeBuild` hooks safely. */
export const chainBeforeBuild = createHookChainer('beforeBuild')

/** Chain multiple `afterAllArtifactBuild` hooks safely. */
export const chainAfterAllArtifactBuild = createHookChainer('afterAllArtifactBuild')

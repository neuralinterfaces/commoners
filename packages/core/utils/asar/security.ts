import { join, basename, dirname, extname, normalize, sep } from 'node:path'
import { existsSync, readdirSync, lstatSync, statSync } from 'node:fs'
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'
import { logAsarState } from './debug.js'
import { createLogger } from '../../assets/utils/logger.js'

// Import from extracted modules
import { sha256, readJsonHeaderBytes, readFullHeaderBytes } from './hash.js'
import { writePlistIntegrity, getInfoPlistPath } from './macos-plist.js'
import {
  writeIntegrityResource,
  readIntegrityResource,
  checkWindowsDependencies,
  isFFIAvailable,
} from './windows-ffi.js'
import {
  isWin,
  isMac,
  isDir,
  findExe,
  looksLikeInstallerExe,
  looksLikePortableExe,
  findSiblingUnpackedDir,
  findMacAppForArtifact,
} from './platform.js'

/* ---------------- Logger ---------------- */
const logger = createLogger('asar-integrity')

// Helper functions that support both string messages and context objects
const log = (message: string, context?: any) => {
  if (typeof context === 'object' && context !== null) {
    logger.info(message, context)
  } else {
    logger.info(message)
  }
}

const warn = (message: string, context?: any) => {
  if (typeof context === 'object' && context !== null) {
    logger.warn(message, context)
  } else {
    logger.warn(message)
  }
}

const error = (message: string, context?: any) => {
  if (typeof context === 'object' && context !== null) {
    logger.error(message, context)
  } else {
    logger.error(message)
  }
}

export const debugAfterPack = async (context: any) => {
  const buildConfig = context.packager?.info?.options || {}
  if (!buildConfig) {
    warn('⚠️ No build configuration found in context.packager.info.options')
    return
  }

  logger.debug('🔍 AfterPack Debug:', {
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

  logger.debug('📦 ASAR Check:', {
    asarPath,
    exists: existsSync(asarPath),
    size: existsSync(asarPath) ? lstatSync(asarPath).size : 'N/A',
  })

  // Log initial ASAR state for debugging
  logAsarState('DEBUG_AFTER_PACK', asarPath, { hook: 'debugAfterPack' })
}

/* ---------------- Dependency checking and validation ---------------- */
function validateDependenciesForIntegrity(): boolean {
  if (!isWin()) return true // Only needed for Windows

  const deps = checkWindowsDependencies()

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
    log('FFI libraries available - using preferred integrity embedding method')
  } else if (deps.rceditAvailable) {
    log('rcedit available - using fallback integrity embedding method')
  }

  return true
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

  const deps = checkWindowsDependencies()

  log('=== ASAR Integrity Setup Status ===')
  log(`FFI Libraries: ${deps.ffiAvailable ? 'Available' : '❌ Missing'}`)
  if (!deps.ffiAvailable) {
    log(`  Error: ${deps.ffiError}`)
    log('  Install: npm install ffi-napi ref-napi')
  }

  log(`rcedit: ${deps.rceditAvailable ? 'Available' : '❌ Missing'}`)
  if (!deps.rceditAvailable) {
    log(`  Error: ${deps.rceditError}`)
    log('  Install: npm install rcedit')
  }

  if (deps.ffiAvailable || deps.rceditAvailable) {
    log('Status: Ready for ASAR integrity embedding')
  } else {
    log('Status: ❌ Cannot embed ASAR integrity - app will fail to start')
  }
  log('=====================================')
}

export function makeAfterPackEmbedAsarIntegrity(options?: {
  mutateAsar?: MutateAsarFn
  strict?: boolean
}) {
  const { mutateAsar, strict = true } = options ?? {}

  return async function afterPackOrArtifact(context: any & ArtifactCtx) {
    try {
      // Log current setup status for visibility
      logIntegritySetupStatus()

      // FIRST: Validate dependencies before attempting anything
      const hasValidDeps = validateDependenciesForIntegrity()
      if (!hasValidDeps) {
        if (strict) {
          throw new Error('ASAR integrity embedding failed: required dependencies are missing. Install ffi-napi ref-napi or rcedit, or set asarIntegrity: { strict: false } to skip.')
        }
        warn('Skipping ASAR integrity embedding due to missing dependencies')
        return
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
        log('Wrote ElectronAsarIntegrity → Info.plist')
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
          if (strict) {
            throw new Error(`Failed to write ASAR integrity resource to ${exeForWin}: ${e.message}`)
          }
          warn('Failed to write integrity resource:', e.message)
          warn('Continuing build without ASAR integrity validation')
          return
        }

        logAsarState('AFTER_RESOURCE_WRITE', asarPath)

        // verify by native readback if FFI is available
        if (isFFIAvailable()) {
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
                  log('Embedded JSON header hash verified')
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

              log('Embedded FULL header hash verified')

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
                const msg = `CRITICAL: ASAR file was modified after integrity embedding! Original: ${fullHash}, Current: ${finalFullHash}`
                error(msg)
                if (strict) throw new Error(msg)
              }
            } catch (e: any) {
              if (strict) throw e
              warn('Failed to write full header fallback:', e.message)
              warn('Continuing build without verified integrity')
            }
          } catch (e: any) {
            if (strict) throw e
            warn('Error during integrity verification:', e.message)
            warn('Continuing build - verification failed but resource may still be embedded')
          }
        } else {
          log('Integrity resource written (verification skipped - FFI not available)')
          logAsarState('VERIFICATION_SKIPPED', asarPath)
        }
      }
    } catch (e: any) {
      if (strict) throw e
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

    // Track ASAR state before fuse flipping - use correct path for macOS
    const asarPath = isMac()
      ? join(appOutDir, `${product}.app`, 'Contents', 'Resources', 'app.asar')
      : join(appOutDir, 'resources', 'app.asar')
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

    log('Fuses flipped successfully on', targetPath)
  } catch (e: any) {
    warn('Fuse flip failed:', e?.message || e)
    // Don't throw - fuse flipping failure shouldn't break the build
  }
}

// Export hook chainers from hooks.ts
export {
  chainAfterPack,
  chainAfterSign,
  chainArtifactBuildCompleted,
  chainBeforeBuild,
  chainAfterAllArtifactBuild,
} from './hooks.js'

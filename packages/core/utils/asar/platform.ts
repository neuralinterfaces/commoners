/**
 * Platform-specific utilities for ASAR integrity
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Platform detection utilities
 */
export const isWin = () => process.platform === 'win32'
export const isMac = () => process.platform === 'darwin'
export const isLinux = () => process.platform === 'linux'

/**
 * Check if path is a directory
 */
export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * Find the main executable in app output directory
 */
export function findExe(appOutDir: string, preferredBase?: string): string {
  const files = readdirSync(appOutDir)
  const exeFiles = files.filter(f => f.endsWith('.exe'))

  if (exeFiles.length === 0) {
    throw new Error(`No .exe found in ${appOutDir}`)
  }

  if (preferredBase && exeFiles.includes(preferredBase)) {
    return join(appOutDir, preferredBase)
  }

  // Prefer non-installer executables
  const nonInstaller = exeFiles.find(f => !looksLikeInstallerExe(f))
  if (nonInstaller) {
    return join(appOutDir, nonInstaller)
  }

  // Fall back to first exe
  return join(appOutDir, exeFiles[0])
}

/**
 * Check if executable name looks like an installer
 */
export function looksLikeInstallerExe(p: string): boolean {
  const base = basename(p, '.exe').toLowerCase()
  const installerKeywords = ['setup', 'install', 'installer']
  return installerKeywords.some(kw => base.includes(kw))
}

/**
 * Check if executable name looks like a portable version
 */
export function looksLikePortableExe(p: string): boolean {
  return basename(p, '.exe').toLowerCase().includes('portable')
}

/**
 * Find sibling unpacked directory for an artifact
 */
export function findSiblingUnpackedDir(artifactFile: string): string | null {
  const dir = dirname(artifactFile)
  const base = basename(artifactFile)

  // Common unpacked directory patterns
  const patterns = [
    base.replace(/\.(exe|zip|dmg|pkg)$/, ' unpacked'),
    base.replace(/\.(exe|zip|dmg|pkg)$/, '.unpacked'),
    'app.asar.unpacked',
  ]

  for (const pattern of patterns) {
    const unpackedPath = join(dir, pattern)
    if (existsSync(unpackedPath) && isDir(unpackedPath)) {
      return unpackedPath
    }
  }

  return null
}

/**
 * Find .app directory for macOS artifact
 */
export function findMacAppForArtifact(artifactFile: string): string | null {
  if (!isMac()) return null

  const dir = dirname(artifactFile)
  const base = basename(artifactFile)

  // If artifact IS the .app, return it
  if (base.endsWith('.app')) {
    return artifactFile
  }

  // Search siblings for .app directories
  const files = readdirSync(dir)
  const appDir = files.find(f => f.endsWith('.app'))

  if (appDir) {
    return join(dir, appDir)
  }

  return null
}

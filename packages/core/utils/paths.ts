import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname } from 'node:path'

/** Convert a file URL or URL pathname to a proper filesystem path (handles Windows drive letters) */
export const toFilePath = (urlOrPathname: string): string => {
  if (urlOrPathname.startsWith('file://')) return fileURLToPath(urlOrPathname)
  const isWindows = typeof process !== 'undefined' && process.platform === 'win32'
  if (isWindows && /^\/[A-Za-z]:/.test(urlOrPathname)) return urlOrPathname.slice(1)
  return urlOrPathname
}

/** Normalize backslashes to forward slashes (for use in URLs/cross-platform comparisons) */
export const slash = (p: string): string => p.replace(/\\/g, '/')

/** Get __filename equivalent from import.meta.url */
export const getFilename = (importMetaUrl: string): string => fileURLToPath(importMetaUrl)

/** Get __dirname equivalent from import.meta.url */
export const getDirname = (importMetaUrl: string): string => dirname(fileURLToPath(importMetaUrl))

/** Convert a filesystem path to a proper file:// URL string */
export const toFileURL = (filepath: string): string => pathToFileURL(filepath).href

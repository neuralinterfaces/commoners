/**
 * Target-specific tooling (Electron, electron-builder, the PWA plugin) is an optional peer
 * dependency: an app installs only what the targets it builds need, so a web-only app does not
 * pull in a desktop toolchain. These helpers load such a package and, when it is missing, say
 * exactly what to install.
 */

import { createRequire } from 'node:module'
import { DependencyError } from '../errors.js'

const requireOptional = createRequire(import.meta.url)

const isMissing = (error: unknown, name: string) => {
  const code = (error as NodeJS.ErrnoException)?.code
  return (
    (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
    String((error as Error).message).includes(name)
  )
}

const missing = (name: string, purpose: string, install: string[]) =>
  new DependencyError(
    `${purpose} need${purpose.endsWith('s') ? '' : 's'} ${name}, which is not installed`,
    `Install it in your project: npm install --save-dev ${install.join(' ')}`
  )

/** import() an optional package, or throw a DependencyError naming what to install */
export const importOptional = async <T = any>(
  name: string,
  purpose: string,
  install: string[] = [name]
): Promise<T> => {
  try {
    return await import(name)
  } catch (error) {
    if (isMissing(error, name)) throw missing(name, purpose, install)
    throw error
  }
}

/** Version of an installed package, or undefined when it is not installed */
export const optionalVersion = (name: string): string | undefined => {
  try {
    return requireOptional(`${name}/package.json`).version
  } catch {
    return undefined
  }
}

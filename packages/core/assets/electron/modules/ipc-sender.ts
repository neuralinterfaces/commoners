/**
 * IPC Sender Validation
 *
 * Electron's security checklist (item 17) asks every IPC handler to check who sent the
 * message. A window that navigates to a remote page keeps the Commoners preload, so a channel
 * allowlist alone would let that page call into the main process. Each message is accepted
 * only when the sending frame, and every frame above it, is an app page:
 * - `app://local` (packaged pages, the default);
 * - the dev server's origin, in development;
 * - a `file://` page inside the app's own files, when pages load from `file://`
 *   (`electron.origin: 'file'`, or development without a dev server);
 * - an origin listed in `electron.security.ipcOrigins`.
 */

import { fileURLToPath } from 'node:url'
import { posix, win32 } from 'node:path'

export interface SenderPolicy {
  /** Exact origins (`scheme://host[:port]`) whose frames may send IPC */
  origins: Set<string>
  /** When set, file:// frames inside this directory may send IPC */
  fileRoot: string | null
}

export interface SenderPolicyOptions {
  /** The app origin, when packaged pages load from it (`app://local`) */
  appOrigin?: string | null
  /** The dev server URL, in development */
  devServerUrl?: string | null
  /** The app's asset directory, when pages load from file:// */
  fileRoot?: string | null
  /** Extra origins the app allows explicitly (`electron.security.ipcOrigins`) */
  extraOrigins?: string[]
}

function originOf(url: string): string | null {
  try {
    const { protocol, host } = new URL(url)
    if (!host) return null // file:, data:, about: and similar have no comparable origin
    return `${protocol}//${host}`
  } catch {
    return null
  }
}

export function createSenderPolicy(options: SenderPolicyOptions = {}): SenderPolicy {
  const origins = new Set<string>()
  const add = (url?: string | null) => {
    const origin = url ? originOf(url) : null
    if (origin) origins.add(origin)
  }
  add(options.appOrigin)
  add(options.devServerUrl)
  options.extraOrigins?.forEach(add)
  return { origins, fileRoot: options.fileRoot || null }
}

function isInsideRoot(filePath: string, root: string): boolean {
  const isWindows = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith('\\\\')
  const path = isWindows ? win32 : posix
  const a = isWindows ? filePath.toLowerCase() : filePath
  const b = isWindows ? root.toLowerCase() : root
  const rel = path.relative(path.resolve(b), path.resolve(a))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Whether a page at this URL may use the app's IPC */
export function isAllowedSenderUrl(url: string, policy: SenderPolicy): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'file:') {
    if (!policy.fileRoot) return false
    try {
      return isInsideRoot(fileURLToPath(parsed), policy.fileRoot)
    } catch {
      return false
    }
  }
  const origin = originOf(url)
  return !!origin && policy.origins.has(origin)
}

/**
 * Why an IPC event must be rejected, or null when its sender is allowed.
 * Checks `event.senderFrame` and each parent frame up to the top of the page, so a subframe
 * from another origin, or an app frame embedded in a foreign page, is rejected.
 */
export function senderRejection(event: any, policy: SenderPolicy | null): string | null {
  if (!policy) return 'IPC sender policy is not configured'
  let frame = event?.senderFrame
  if (!frame) return 'IPC message has no sender frame (it was destroyed or navigated)'
  for (let depth = 0; frame; depth++) {
    if (depth > 32) return 'IPC sender frame tree is too deep'
    const url = String(frame.url ?? '')
    if (!isAllowedSenderUrl(url, policy))
      return depth === 0
        ? `Rejected IPC from a frame at ${url || '(no URL)'}: not an app page`
        : `Rejected IPC from a frame inside ${url || '(no URL)'}: not an app page`
    frame = frame.parent
  }
  return null
}

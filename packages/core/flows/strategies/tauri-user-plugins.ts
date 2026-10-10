/**
 * User Rust plugins for Tauri targets: `tauri.plugin` points at a crate exporting
 * `pub fn init<R: Runtime>() -> TauriPlugin<R>`, which the generated app registers.
 * Its commands are reachable from the webview (e.g. ctx.tapPort forwarding frames)
 * once the declared permissions are granted in the generated capabilities.
 */

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export type TauriUserPluginConfig = {
  path: string // Crate directory, relative to the project root
  permissions?: string[] // Granted to the main window, e.g. 'sense:allow-frames'
}

export type ResolvedTauriUserPlugin = {
  crate: string
  ident: string
  path: string
  permissions: string[]
}

const crateName = (cargoToml: string) => {
  const pkg = cargoToml.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0] ?? ''
  return pkg.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]
}

export const resolveTauriUserPlugins = (
  root: string,
  config?: TauriUserPluginConfig | TauriUserPluginConfig[]
): ResolvedTauriUserPlugin[] => {
  if (!config) return []
  return (Array.isArray(config) ? config : [config]).map(({ path, permissions = [] }) => {
    const dir = isAbsolute(path) ? path : resolve(root, path)
    const manifest = join(dir, 'Cargo.toml')
    if (!existsSync(manifest))
      throw new Error(`tauri.plugin: no Cargo.toml at ${dir} (expected a crate exporting init())`)
    const crate = crateName(readFileSync(manifest, 'utf8'))
    if (!crate) throw new Error(`tauri.plugin: ${manifest} has no [package] name`)
    return { crate, ident: crate.replace(/-/g, '_'), path: dir, permissions }
  })
}

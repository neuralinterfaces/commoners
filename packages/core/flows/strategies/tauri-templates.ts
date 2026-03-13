/**
 * Tauri template generators
 *
 * Pure functions for generating Tauri project files (Cargo.toml, main.rs,
 * tauri.conf.json, capabilities). Separated from the strategy class to
 * allow direct testing without triggering the build flow import chain.
 */

export function generateCargoToml(name: string): string {
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = { version = "2", features = [] }
`
}

export function generateMainRs(): string {
  return `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`
}

export function generateTauriConf(opts: {
  name: string
  appId: string
  version: string
  icon: any
  tauriConfig: any
  electronWindow: any
  externalBins: string[]
}): Record<string, any> {
  const { name, appId, version, icon, tauriConfig = {}, electronWindow, externalBins } = opts
  const windowConfig = tauriConfig.window || electronWindow || {}

  // Resolve icon paths
  const icons: string[] = []
  if (icon) {
    if (typeof icon === 'string') icons.push(icon)
    else if (Array.isArray(icon)) icons.push(...icon)
  }

  const sanitizedId = appId || `com.commoners.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`

  const conf: Record<string, any> = {
    productName: name,
    identifier: sanitizedId,
    version: version || '0.1.0',
    build: {
      frontendDist: '../dist/',
    },
    app: {
      windows: [
        {
          title: windowConfig.title || name,
          width: windowConfig.width || 800,
          height: windowConfig.height || 600,
          fullscreen: windowConfig.fullscreen || false,
          resizable: windowConfig.resizable !== false,
          decorations: windowConfig.decorations !== false,
        },
      ],
      security: {},
    },
    bundle: {
      active: true,
      targets: 'all',
      icon: icons.length > 0 ? icons : ['icons/icon.png'],
    },
  }

  // CSP
  const csp = tauriConfig.security?.csp
  if (csp !== false) {
    conf.app.security.csp =
      csp || "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  }

  // Service sidecars
  if (externalBins.length > 0) {
    conf.bundle.externalBin = externalBins
  }

  // Raw config overrides
  if (tauriConfig.config) {
    deepMerge(conf, tauriConfig.config)
  }

  return conf
}

export function generateCapabilities(serviceIds: string[]): Record<string, any> {
  const permissions = ['core:default', 'opener:default']

  if (serviceIds.length > 0) {
    permissions.push('shell:allow-spawn')
  }

  return {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'Capability for the main window',
    windows: ['main'],
    permissions,
  }
}

/** Simple recursive merge (source wins for primitives, recurses for objects) */
function deepMerge(target: Record<string, any>, source: Record<string, any>): void {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
}

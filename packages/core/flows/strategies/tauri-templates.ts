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

export type SidecarEntry = { id: string; bin: string; port?: number }

export function generateMainRs(services: SidecarEntry[] = []): string {
  if (services.length === 0) {
    // No services — simple main.rs
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

  // Generate service spawn entries as Rust array literal
  const serviceArray = services.map(s => `("${s.id}", "${s.bin}")`).join(', ')

  return `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

struct ServiceState {
    children: Mutex<HashMap<String, tauri_plugin_shell::process::CommandChild>>,
    urls: Mutex<HashMap<String, String>>,
}

fn get_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

#[tauri::command]
fn commoners_get_services(state: tauri::State<ServiceState>) -> HashMap<String, serde_json::Value> {
    let urls = state.urls.lock().unwrap();
    let children = state.children.lock().unwrap();
    let mut result = HashMap::new();
    for (id, url) in urls.iter() {
        let running = children.contains_key(id);
        let mut entry = serde_json::Map::new();
        entry.insert("url".into(), serde_json::Value::String(url.clone()));
        entry.insert("status".into(), serde_json::Value::Bool(running));
        result.insert(id.clone(), serde_json::Value::Object(entry));
    }
    result
}

#[tauri::command]
fn commoners_service_close(id: String, state: tauri::State<ServiceState>) -> bool {
    let mut children = state.children.lock().unwrap();
    if let Some(child) = children.remove(&id) {
        let _ = child.kill();
        true
    } else {
        false
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(ServiceState {
            children: Mutex::new(HashMap::new()),
            urls: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commoners_get_services,
            commoners_service_close,
        ])
        .setup(|app| {
            let services: Vec<(&str, &str)> = vec![${serviceArray}];

            for (id, bin_name) in services {
                let port = get_free_port();
                let url = format!("http://localhost:{}", port);

                // Store URL immediately so frontend can query it
                app.state::<ServiceState>()
                    .urls.lock().unwrap()
                    .insert(id.to_string(), url);

                // Spawn sidecar with PORT env var
                let sidecar = app.shell()
                    .sidecar(bin_name)
                    .expect(&format!("failed to create sidecar for {}", id))
                    .env("PORT", port.to_string());

                let (mut rx, child) = sidecar
                    .spawn()
                    .expect(&format!("failed to spawn sidecar {}", id));

                app.state::<ServiceState>()
                    .children.lock().unwrap()
                    .insert(id.to_string(), child);

                // Monitor stdout/stderr and lifecycle events
                let handle = app.handle().clone();
                let id_owned = id.to_string();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                let _ = handle.emit(
                                    &format!("commoners:services:{}:log", id_owned),
                                    String::from_utf8_lossy(&line).to_string(),
                                );
                            }
                            CommandEvent::Stderr(line) => {
                                let _ = handle.emit(
                                    &format!("commoners:services:{}:log", id_owned),
                                    String::from_utf8_lossy(&line).to_string(),
                                );
                            }
                            CommandEvent::Terminated(payload) => {
                                let _ = handle.emit(
                                    &format!("commoners:services:{}:closed", id_owned),
                                    payload.code,
                                );
                                handle.state::<ServiceState>()
                                    .children.lock().unwrap()
                                    .remove(&id_owned);
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
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
    permissions.push('shell:allow-spawn', 'shell:allow-kill')
  }

  return {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'Capability for the main window',
    windows: ['main'],
    permissions,
  }
}

/**
 * Generate a dev-mode Cargo.toml with devtools feature enabled.
 * Separate from the build Cargo.toml which omits devtools.
 */
export function generateDevCargoToml(name: string): string {
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = { version = "2", features = [] }
`
}

/**
 * Generate a dev-mode tauri.conf.json with devUrl pointing to the Vite dev server.
 * Does not include frontendDist (dev mode serves from Vite).
 */
export function generateDevTauriConf(opts: {
  name: string
  appId?: string
  version?: string
  devUrl: string
  window?: { title?: string; width?: number; height?: number }
}): Record<string, any> {
  const { name, devUrl, window: windowConfig = {} } = opts
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

  return {
    productName: name,
    identifier: opts.appId || `com.commoners.${sanitizedName.replace(/[^a-z0-9]/g, '')}`,
    version: opts.version || '0.1.0',
    build: {
      devUrl,
    },
    app: {
      windows: [
        {
          title: windowConfig.title || name,
          width: windowConfig.width || 800,
          height: windowConfig.height || 600,
        },
      ],
      security: {},
    },
    bundle: {
      active: true,
    },
  }
}

/**
 * Generate a build.rs file for Tauri projects.
 */
export function generateBuildRs(): string {
  return 'fn main() {\n  tauri_build::build()\n}\n'
}

/**
 * Generate a lib.rs file for Tauri mobile entry points.
 */
export function generateLibRs(): string {
  return `#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`
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

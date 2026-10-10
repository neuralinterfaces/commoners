/**
 * Tauri template generators
 *
 * Pure functions for generating Tauri project files (Cargo.toml, main.rs,
 * tauri.conf.json, capabilities). Separated from the strategy class to
 * allow direct testing without triggering the build flow import chain.
 */

import { ResolvedOverlay, tauriOverlayWindowConfig } from '../../assets/utils/overlay.js'
import { buildCSP, resolveCSP, type CSPOverride } from '../../assets/utils/csp.js'

type UserPlugin = { crate: string; ident: string; path: string; permissions?: string[] }

// Path dependencies on the user's plugin crates (tauri.plugin)
const userPluginDependencies = (plugins: UserPlugin[] = []) =>
  plugins.map(p => `${p.crate} = { path = ${JSON.stringify(p.path)} }\n`).join('')

const userPluginRegistrations = (plugins: UserPlugin[] = []) =>
  plugins.map(p => `\n        .plugin(${p.ident}::init())`).join('')

// Transparent windows on macOS need Tauri's private-API feature (and app.macOSPrivateApi)
export function generateCargoToml(
  name: string,
  opts: { overlay?: boolean; userPlugins?: UserPlugin[] } = {}
): string {
  const tauriFeatures = opts.overlay ? '["macos-private-api"]' : '[]'
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ${tauriFeatures} }
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["signal"] }
${userPluginDependencies(opts.userPlugins)}
[build-dependencies]
tauri-build = { version = "2", features = [] }
${opts.overlay ? MACOS_OVERLAY_DEPENDENCIES : ''}`
}

const MACOS_OVERLAY_DEPENDENCIES = `
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
`

export type SidecarEntry = { id: string; bin: string; port?: number }

// Click-through, display bounds and the macOS window level have no tauri.conf.json
// equivalent — set them at startup, then show the (initially hidden) window
function overlaySetupRs(overlay?: ResolvedOverlay | null): string {
  if (!overlay) return ''
  const lines: string[] = []
  if (overlay.clickThrough)
    lines.push('                let _ = window.set_ignore_cursor_events(true);')
  if (overlay.coverDisplay)
    lines.push(
      '                if let Ok(Some(monitor)) = window.primary_monitor() {',
      '                    let _ = window.set_position(*monitor.position());',
      '                    let _ = window.set_size(*monitor.size());',
      '                }'
    )
  if (overlay.alwaysOnTop || overlay.allWorkspaces)
    lines.push(
      '                #[cfg(target_os = "macos")]',
      '                float_overlay(&window);'
    )
  lines.push('                let _ = window.show();')
  return `
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // Like Electron's visibleOnFullScreen

            if let Some(window) = app.get_webview_window("main") {
${lines.join('\n')}
            }
`
}

// Matches Electron's setAlwaysOnTop('screen-saver') + setVisibleOnAllWorkspaces. Tauri's own
// alwaysOnTop is the floating level (5), which macOS keeps below the menu bar.
function floatOverlayRs(overlay?: ResolvedOverlay | null): string {
  if (!overlay || (!overlay.alwaysOnTop && !overlay.allWorkspaces)) return ''
  const calls: string[] = []
  // Only a non-activating NSPanel appears over another app's fullscreen Space. The class
  // swap drops Tauri's window subclass (a plain panel can't become key), so it is limited
  // to click-through overlays, which never take focus anyway.
  const asPanel = overlay.allWorkspaces && overlay.clickThrough
  if (asPanel)
    calls.push(
      '            object_setClass(ns_window, class!(NSPanel));',
      '            let mask: usize = msg_send![ns_window, styleMask];',
      '            let _: () = msg_send![ns_window, setStyleMask: mask | (1usize << 7)]; // NSWindowStyleMaskNonactivatingPanel'
    )
  if (overlay.alwaysOnTop)
    calls.push(
      '            let _: () = msg_send![ns_window, setLevel: 1000isize]; // NSScreenSaverWindowLevel'
    )
  if (overlay.allWorkspaces)
    calls.push(
      '            // CanJoinAllSpaces | Stationary | FullScreenAuxiliary',
      '            let _: () = msg_send![ns_window, setCollectionBehavior: (1usize << 0) | (1usize << 4) | (1usize << 8)];'
    )
  return `
#[cfg(target_os = "macos")]
fn float_overlay(window: &tauri::WebviewWindow) {
${
  asPanel
    ? `    use objc2::{class, msg_send, runtime::{AnyClass, AnyObject}};
    extern "C" {
        fn object_setClass(obj: *mut AnyObject, cls: *const AnyClass) -> *const AnyClass;
    }`
    : '    use objc2::{msg_send, runtime::AnyObject};'
}
    if let Ok(ns_window) = window.ns_window() {
        let ns_window = ns_window as *mut AnyObject;
        unsafe {
${calls.join('\n')}
        }
    }
}
`
}

export function generateMainRs(
  services: SidecarEntry[] = [],
  opts: { overlay?: ResolvedOverlay | null; userPlugins?: UserPlugin[] } = {}
): string {
  const overlaySetup = overlaySetupRs(opts.overlay)
  const userPlugins = userPluginRegistrations(opts.userPlugins)
  const overlayFns = floatOverlayRs(opts.overlay)

  if (services.length === 0) {
    // No services — simple main.rs
    const setup = overlaySetup
      ? `
        .setup(|app| {${overlaySetup}
            Ok(())
        })`
      : ''
    return `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
${overlaySetup ? '\nuse tauri::Manager;\n' : ''}${overlayFns}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())${userPlugins}${setup}
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`
  }

  // Generate service spawn entries as Rust array literal
  // sidecar() takes the bare binary name; Tauri resolves it next to the app executable
  const serviceArray = services.map(s => `("${s.id}", "${s.bin.split('/').pop()}")`).join(', ')

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

${overlayFns}
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
        .plugin(tauri_plugin_opener::init())${userPlugins}
        .manage(ServiceState {
            children: Mutex::new(HashMap::new()),
            urls: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commoners_get_services,
            commoners_service_close,
        ])
        .setup(|app| {${overlaySetup}
            let services: Vec<(&str, &str)> = vec![${serviceArray}];

            for (id, bin_name) in services {
                let port = get_free_port();
                let url = format!("http://localhost:{}", port);

                // Store URL immediately so frontend can query it
                app.state::<ServiceState>()
                    .urls.lock().unwrap()
                    .insert(id.to_string(), url);

                // Spawn sidecar with PORT env var. A service that fails to start is
                // reported and skipped — panicking in setup() aborts the whole app on macOS
                let spawned = app.shell()
                    .sidecar(bin_name)
                    .map(|cmd| cmd.env("PORT", port.to_string()).env("HOST", "localhost"))
                    .and_then(|cmd| cmd.spawn());

                let (mut rx, child) = match spawned {
                    Ok(pair) => pair,
                    Err(err) => {
                        eprintln!("[commoners] service {} failed to start: {}", id, err);
                        let _ = app.handle().emit(
                            &format!("commoners:services:{}:error", id),
                            err.to_string(),
                        );
                        continue;
                    }
                };

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

            // Signals bypass RunEvent::Exit; turn them into a clean exit so sidecars are killed
            let exit_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if tokio::signal::ctrl_c().await.is_ok() {
                    exit_handle.exit(0);
                }
            });

            #[cfg(unix)]
            {
                use tokio::signal::unix::{signal, SignalKind};
                let exit_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(mut term) = signal(SignalKind::terminate()) {
                        term.recv().await;
                        exit_handle.exit(0);
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                kill_all_sidecars(app);
            }
        });
}

fn kill_all_sidecars(app: &tauri::AppHandle) {
    let state = app.state::<ServiceState>();
    let mut children = state.children.lock().unwrap();
    for (_, child) in children.drain() {
        let _ = child.kill();
    }
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
  overlay?: ResolvedOverlay | null
  backgroundThrottling?: boolean
  csp?: CSPOverride // Top-level security.csp; tauri.security.csp takes precedence
}): Record<string, any> {
  const {
    name,
    appId,
    version,
    icon,
    tauriConfig = {},
    electronWindow,
    externalBins,
    overlay,
  } = opts
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
    version: (version || '0.1.0').replace(/-.*$/, ''), // Strip pre-release for MSI/NSIS compatibility
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

  if (overlay) {
    Object.assign(conf.app.windows[0], tauriOverlayWindowConfig(overlay))
    conf.app.macOSPrivateApi = true
  }
  if (opts.backgroundThrottling === false) conf.app.windows[0].backgroundThrottling = 'disabled'

  // CSP
  // The shared policy (assets/utils/csp.ts) plus Tauri's IPC origins and local sidecars.
  // Tauri adds hashes for the inline scripts it serves itself.
  const csp = resolveCSP(
    buildCSP({
      connect: [
        'ipc:',
        'http://ipc.localhost',
        ...(externalBins.length ? ['http://localhost:*'] : []),
      ],
    }),
    tauriConfig.security?.csp ?? opts.csp
  )
  if (csp) conf.app.security.csp = csp

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

export function generateCapabilities(
  serviceIds: string[],
  extraPermissions: string[] = [] // e.g. user plugin permissions (tauri.plugin)
): Record<string, any> {
  const permissions = ['core:default', 'opener:default', ...extraPermissions]

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
export function generateDevCargoToml(
  name: string,
  opts: { overlay?: boolean; userPlugins?: UserPlugin[] } = {}
): string {
  const tauriFeatures = opts.overlay ? '["devtools", "macos-private-api"]' : '["devtools"]'
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ${tauriFeatures} }
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
${userPluginDependencies(opts.userPlugins)}
[build-dependencies]
tauri-build = { version = "2", features = [] }
${opts.overlay ? MACOS_OVERLAY_DEPENDENCIES : ''}`
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
  overlay?: ResolvedOverlay | null
  backgroundThrottling?: boolean
}): Record<string, any> {
  const { name, devUrl, window: windowConfig = {}, overlay } = opts
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

  const conf: Record<string, any> = {
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

  if (overlay) {
    Object.assign(conf.app.windows[0], tauriOverlayWindowConfig(overlay))
    conf.app.macOSPrivateApi = true
  }
  if (opts.backgroundThrottling === false) conf.app.windows[0].backgroundThrottling = 'disabled'

  return conf
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

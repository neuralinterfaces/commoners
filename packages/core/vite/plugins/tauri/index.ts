/**
 * Tauri Vite plugin for dev mode
 *
 * During `commoners start --target tauri`, this plugin:
 * 1. Waits for the Vite dev server to start
 * 2. Generates a minimal src-tauri/ project pointing to the dev server URL
 * 3. Spawns `npx tauri dev` for hot-reloading
 *
 * During build, it only sets `base: './'` for correct asset paths.
 * Full build packaging is handled by TauriBuildStrategy.
 */

import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolveServerUrl } from '../electron/server.js'
import type { HooksInterface, ResolvedConfig } from '../../../types.js'
import { isTauriMobile } from '../../../globals.js'

type Plugin = import('vite').Plugin

let tauriProcess: ChildProcess | null = null

/** Get the Tauri CLI subcommand for the target (e.g., 'dev', 'ios dev', 'android dev') */
function getTauriDevCommand(target: string): string[] {
  if (target === 'ios-tauri') return ['tauri', 'ios', 'dev']
  if (target === 'android-tauri') return ['tauri', 'android', 'dev']
  return ['tauri', 'dev']
}

export default async function tauriPlugin({
  root,
  outDir,
  hooks,
  config,
}: {
  root: string
  outDir: string
  hooks?: HooksInterface
  config?: ResolvedConfig
}): Promise<Plugin[]> {
  return [
    {
      name: '@commoners/tauri',
      apply: 'serve',
      configureServer(server) {
        server.httpServer?.once('listening', async () => {
          const devUrl = resolveServerUrl(server)
          if (!devUrl) return

          const name = config?.name || 'commoners-app'
          const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
          const tauriConfig = (config as any)?.tauri || {}

          // Generate src-tauri/ in the outDir (temp dir)
          const srcTauriDir = join(outDir, 'src-tauri')
          const srcDir = join(srcTauriDir, 'src')
          const capDir = join(srcTauriDir, 'capabilities')

          mkdirSync(srcDir, { recursive: true })
          mkdirSync(capDir, { recursive: true })

          // Cargo.toml — devtools feature enabled for dev
          writeFileSync(
            join(srcTauriDir, 'Cargo.toml'),
            `[package]
name = "${sanitizedName}"
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
          )

          // src/main.rs
          writeFileSync(
            join(srcDir, 'main.rs'),
            `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`
          )

          // build.rs
          writeFileSync(
            join(srcTauriDir, 'build.rs'),
            'fn main() {\n  tauri_build::build()\n}\n'
          )

          // lib.rs (mobile entry point, needed for tauri mobile targets)
          if (isTauriMobile(config?.target)) {
            writeFileSync(
              join(srcDir, 'lib.rs'),
              `#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`
            )
          }

          // tauri.conf.json with devUrl
          const windowConfig = tauriConfig.window || config?.electron?.window || {}
          const tauriConf = {
            productName: name,
            identifier:
              config?.appId ||
              `com.commoners.${sanitizedName.replace(/[^a-z0-9]/g, '')}`,
            version: config?.version || '0.1.0',
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
          writeFileSync(
            join(srcTauriDir, 'tauri.conf.json'),
            JSON.stringify(tauriConf, null, 2)
          )

          // capabilities/default.json
          writeFileSync(
            join(capDir, 'default.json'),
            JSON.stringify(
              {
                $schema: '../gen/schemas/desktop-schema.json',
                identifier: 'default',
                description: 'Capability for the main window',
                windows: ['main'],
                permissions: ['core:default', 'opener:default'],
              },
              null,
              2
            )
          )

          // Spawn tauri dev (or tauri ios dev / tauri android dev for mobile)
          const devCommand = getTauriDevCommand(config?.target || 'tauri')
          tauriProcess = spawn('npx', devCommand, {
            cwd: outDir,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
          })

          tauriProcess.stdout?.on('data', data => {
            const msg = data.toString().trim()
            if (msg) hooks?.emit({ type: 'dev:tauri:stdout', data: msg } as any)
          })

          tauriProcess.stderr?.on('data', data => {
            const msg = data.toString().trim()
            if (msg) hooks?.emit({ type: 'dev:tauri:stderr', data: msg } as any)
          })

          tauriProcess.on('error', err => {
            hooks?.emit({ type: 'dev:server:error', error: err })
          })

          // Clean up tauri process when Vite server closes
          server.httpServer?.on('close', () => {
            if (tauriProcess && !tauriProcess.killed) {
              tauriProcess.kill()
              tauriProcess = null
            }
          })
        })
      },
    },
    {
      name: '@commoners/tauri',
      apply: 'build',
      config(config) {
        config.base ??= './'
      },
    },
  ]
}

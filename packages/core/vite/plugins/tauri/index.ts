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

import { join, dirname } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolveServerUrl } from '../electron/server.js'
import type { HooksInterface, ResolvedConfig } from '../../../types.js'
import { isTauriMobile } from '../../../globals.js'
import { generateMainRs, generateDevCargoToml, generateDevTauriConf, generateBuildRs, generateLibRs, generateCapabilities } from '../../../flows/strategies/tauri-templates.js'

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

          // Generate src-tauri/ in the parent of outDir (outDir is the dist/ subdir)
          const tauriRoot = dirname(outDir)
          const srcTauriDir = join(tauriRoot, 'src-tauri')
          const srcDir = join(srcTauriDir, 'src')
          const capDir = join(srcTauriDir, 'capabilities')

          mkdirSync(srcDir, { recursive: true })
          mkdirSync(capDir, { recursive: true })

          // Cargo.toml — devtools feature enabled for dev
          writeFileSync(join(srcTauriDir, 'Cargo.toml'), generateDevCargoToml(sanitizedName))

          // src/main.rs (no sidecars in dev — services are managed by Node.js)
          writeFileSync(join(srcDir, 'main.rs'), generateMainRs())

          // build.rs
          writeFileSync(join(srcTauriDir, 'build.rs'), generateBuildRs())

          // lib.rs (mobile entry point, needed for tauri mobile targets)
          if (isTauriMobile(config?.target)) {
            writeFileSync(join(srcDir, 'lib.rs'), generateLibRs())
          }

          // tauri.conf.json with devUrl
          const windowConfig = tauriConfig.window || config?.electron?.window || {}
          const tauriConf = generateDevTauriConf({
            name,
            appId: config?.appId,
            version: config?.version,
            devUrl,
            window: windowConfig,
          })
          writeFileSync(
            join(srcTauriDir, 'tauri.conf.json'),
            JSON.stringify(tauriConf, null, 2)
          )

          // capabilities/default.json (no services in dev — no shell permissions needed)
          writeFileSync(
            join(capDir, 'default.json'),
            JSON.stringify(generateCapabilities([]), null, 2)
          )

          // Spawn tauri dev (or tauri ios dev / tauri android dev for mobile)
          const devCommand = getTauriDevCommand(config?.target || 'tauri')
          tauriProcess = spawn('npx', devCommand, {
            cwd: tauriRoot,
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

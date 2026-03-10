import * as cleanup from '../../../cleanup.js'
import { createNoOpHooks } from '../../../ui.js'
import { HooksInterface } from '../../../types.js'
import { treeKillGracefully } from './processes.js'
import { createLogger } from '../../../assets/utils/logger.js'

const logger = createLogger('electron')

type ChildProcess = import('node:child_process').ChildProcess


const cleanupElectronApp = async () => {
  const { app } = electronGlobalStates
  if (app) {
    app.removeAllListeners()
    await treeKillGracefully(app.pid!)
  }
  delete electronGlobalStates.app
}

export const electronGlobalStates: { app?: ChildProcess } = {}

let cleanupPromise = null

export async function startup(root, hooks: HooksInterface = createNoOpHooks(), outDir?: string) {

  cleanupPromise = null // Reset stale promise from previous test/startup

  // Point Electron at the outDir (which contains the temp package.json with main field)
  // instead of '.' (which would read the host project's package.json)
  const argv = [outDir || '.', '--no-sandbox']

  // In testing mode, minimize Chromium subprocesses to prevent crashes
  // that close the CDP page and cause test flakiness.
  if (process.env.__COMMONERS_TESTING) {
    argv.push('--in-process-gpu')
    argv.push('--disable-dev-shm-usage')
  }

  // Pass remote debugging port as a CLI argument for testing
  // This must be a spawn argument (not app.commandLine.appendSwitch) because
  // Chromium reads CLI flags before the Electron main process JS executes.
  const rdpPort = process.env.COMMONERS_REMOTE_DEBUGGING_PORT
  if (rdpPort) {
    argv.push(`--remote-debugging-port=${rdpPort}`)
    argv.push('--remote-allow-origins=*')
  }

  const { spawn } = await import('node:child_process')
  const electron = await import('electron')

  const electronPath = <any>(electron.default ?? electron)

  await cleanupElectronApp() // Ensure any previous Electron.app is killed before starting a new one

  logger.debug('Starting Electron with argv:', argv)

  // Start Electron.app
  const app = (electronGlobalStates.app = spawn(electronPath, argv, {
    cwd: root, // Ensure the app is started from the root of the selected project
    env: { ...process.env, FORCE_COLOR: '1' },
    detached: false, // Do not detach the process. This ensures it will exit when the Node.js process exits, otherwise allows a graceful shutdown.
    stdio: ['ignore', 'pipe', 'pipe'],
  }))

  // Clean up electron reference when the child process exits
  app.once('exit', () => {
    delete electronGlobalStates.app
  })

  // In production, exit the parent process when Electron closes.
  // In testing, defer cleanup to the test's afterAll handler so that
  // the Vite dev server and services remain available for assertions.
  if (!process.env.__COMMONERS_TESTING) {
    app.once('exit', cleanup.exit)
  }
  app.stdout.on('data', data => {
    logger.debug('Emitting dev:electron:stdout')
    hooks.emit({ type: 'dev:electron:stdout', data })
  }) // Print out any output from Electron.app
  app.stderr.on('data', data => {
    logger.debug('Emitting dev:electron:stderr')
    hooks.emit({ type: 'dev:electron:stderr', data })
  }) // Print out any errors from Electron.app
  // Register a fresh cleanup handler each time so cleanup.ts's `called` flag
  // from a previous invocation doesn't prevent the new Electron from being killed.
  cleanup.onCleanup(async () => cleanupPromise || (cleanupPromise = cleanupElectronApp()))
  logger.debug('Emitting dev:electron:ready', { pid: app.pid })
  hooks.emit({ type: 'dev:electron:ready', app }) // Emit the start event

  return app
}

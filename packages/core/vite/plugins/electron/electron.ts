import * as cleanup from '../../../cleanup.js'
import { createNoOpHooks } from '../../../hooks.js'
import { HooksInterface } from '../../../types.js'
import { treeKillGracefully } from './processes.js'

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
const onExit = async () => cleanupPromise || (cleanupPromise = cleanupElectronApp()) // Ensure cleanup is only done once

export async function startup(root, hooks: HooksInterface = createNoOpHooks()) {

  const argv = ['.', '--no-sandbox']

  const { spawn } = await import('node:child_process')
  const electron = await import('electron')

  const electronPath = <any>(electron.default ?? electron)

  await cleanupElectronApp() // Ensure any previous Electron.app is killed before starting a new one

  // Start Electron.app
  const app = (electronGlobalStates.app = spawn(electronPath, argv, {
    cwd: root, // Ensure the app is started from the root of the selected project
    env: { ...process.env, FORCE_COLOR: '1' },
    detached: false, // Do not detach the process. This ensures it will exit when the Node.js process exits, otherwise allows a graceful shutdown.
    stdio: ['ignore', 'pipe', 'pipe'],
  }))

  app.once('exit', cleanup.exit) // Kill the process after Electron.app exits
  app.stdout.on('data', data => hooks.emit({ type: 'dev:electron:stdout', data })) // Print out any output from Electron.app
  app.stderr.on('data', data => hooks.emit({ type: 'dev:electron:stderr', data })) // Print out any errors from Electron.app
  cleanup.onCleanup(onExit) // Kill the process after the process exits

  return app
}

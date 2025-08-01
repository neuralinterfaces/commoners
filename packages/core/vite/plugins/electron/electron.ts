import * as cleanup from '../../../cleanup.js';
import { printServiceMessage } from '../../../utils/formatting.js'
import { treeKillGracefully } from './processes.js'

type ChildProcess = import('node:child_process').ChildProcess

const labelRegexp = /\[.*\] /
const ansiRegex = new RegExp('[\\u001b\\x1b][[\\]()#;?]*([0-9]{1,4}(;[0-9]{0,4})*)?[\\dA-PR-TZcf-ntqry=><]', 'g');

const log = async (data, method = 'log') => {
    const message = data.toString()
    if (labelRegexp.test(message.replace(ansiRegex, ''))) console[method](message)
    else await printServiceMessage('commoners-electron-process', message, method)
}


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

export async function startup( root ) {
    
    const argv = ['.', '--no-sandbox']

    const { spawn } = await import('node:child_process')
    const electron = await import('electron')
    
    const electronPath = <any>(electron.default ?? electron)
  
    await cleanupElectronApp() // Ensure any previous Electron.app is killed before starting a new one
  
    // Start Electron.app
    const app = electronGlobalStates.app = spawn(electronPath, argv, {  
      cwd: root, // Ensure the app is started from the root of the selected project
      env: { ...process.env, FORCE_COLOR: '1' },
      detached: false, // Do not detach the process. This ensures it will exit when the Node.js process exits, otherwise allows a graceful shutdown.
      stdio: [ 'ignore', 'pipe', 'pipe' ]
    })

    app.once('exit', cleanup.exit)// Kill the process after Electron.app exits
    app.stdout.on('data', data => log(data)) // Print out any messages from Electron.app
    app.stderr.on('data', data => log(data, 'error')) // Print out any errors from Electron.app
    cleanup.onCleanup(onExit) // Kill the process after the process exits
    
    return app
  }
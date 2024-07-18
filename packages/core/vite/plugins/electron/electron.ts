import { printServiceMessage } from '../../../utils/formatting.js'
import { treeKillSync } from './processes.js'


const labelRegexp = /\[.*\] /
const ansiRegex = new RegExp('[\\u001b\\x1b][[\\]()#;?]*([0-9]{1,4}(;[0-9]{0,4})*)?[\\dA-PR-TZcf-ntqry=><]', 'g');

const log = async (data, method = 'log') => {
    const message = data.toString()
    if (labelRegexp.test(message.replace(ansiRegex, ''))) console[method](message)
    else await printServiceMessage('commoners-electron-process', message, method)
}


export async function startup( root ) {
    
    const argv = ['.', '--no-sandbox']
    const { spawn } = await import('node:child_process')
    const electron = await import('electron')
    const electronPath = <any>(electron.default ?? electron)
  
    await startup.exit()
  
    // Start Electron.app
    const app = process.electronApp = spawn(electronPath, argv, {  cwd: root,  env: { ...process.env, FORCE_COLOR: '1' } }) // Ensure the app is started from the root of the selected project
    
    // Exit command after Electron.app exits
    app.once('exit', process.exit)

    // Print out any messages from Electron.app
    app.stdout.on('data', data => log(data))

    // Print out any errors from Electron.app
    app.stderr.on('data', data => log(data, 'error'))

    if (!startup.hookedProcessExit) {
      startup.hookedProcessExit = true
      process.once('exit', startup.exit)
    }
  }

  startup.hookedProcessExit = false

  startup.exit = async () => {
    if (process.electronApp) {
      process.electronApp.removeAllListeners()
      treeKillSync(process.electronApp.pid!)
    }
  }
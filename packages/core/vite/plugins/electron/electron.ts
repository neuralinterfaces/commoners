import { chalk } from '../../../globals.js'
import { treeKillSync } from './processes'

export async function startup( root ) {

    const _chalk = await chalk
    
    const argv = ['.', '--no-sandbox']
    const { spawn } = await import('node:child_process')
    const electron = await import('electron')
    const electronPath = <any>(electron.default ?? electron)
  
    await startup.exit()
  
    // Start Electron.app
    const app = process.electronApp = spawn(electronPath, argv, { 
      cwd: root // Ensure the app is started from the root of the selected project
    })
  
    // Exit command after Electron.app exits
    app.once('exit', process.exit)

    const labelRegexp = /\[.*\] /
    const globalRegexp = new RegExp(labelRegexp, 'g')

    const log = (data, method = 'log') => {
        const message = data.toString()
        const resolvedMessage = labelRegexp.test(message) ? message : `[commoners-electron-process] ${data.toString()}`

        // Match all labels in the message
        let finalMessage = resolvedMessage

        let addedLength = 0
        for (const match of resolvedMessage.matchAll(globalRegexp)) {
            const index = match.index
            const label = match[0]
            const newLabel = _chalk.bold(_chalk.greenBright(label))
            const actualIdx = index + addedLength
            finalMessage = finalMessage.slice(0, actualIdx) + newLabel + resolvedMessage.slice(actualIdx + label.length)
            addedLength += newLabel.length - label.length

        }

        console[method](finalMessage)
    }

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
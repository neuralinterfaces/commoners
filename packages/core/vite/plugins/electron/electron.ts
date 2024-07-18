import { treeKillSync } from './processes'

export async function startup( root ) {
    
    const argv = ['.', '--no-sandbox']
    const { spawn } = await import('node:child_process')
    const electron = await import('electron')
    const electronPath = <any>(electron.default ?? electron)
  
    await startup.exit()
  
    // Start Electron.app
    process.electronApp = spawn(electronPath, argv, { 
      stdio: 'inherit',
      cwd: root // Ensure the app is started from the root of the selected project
    })
  
    // Exit command after Electron.app exits
    process.electronApp.once('exit', process.exit)
  
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
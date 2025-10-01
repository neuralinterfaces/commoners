
import { spawn } from 'node:child_process'
import { createNoOpHooks } from '../ui.js'

const children = {}

const kill = code => {
  for (const child in children) children[child].kill()
}

// Ensure all processes are killed
process.on('uncaughtException', e => {
  // Log critical errors but let the process handle it
  if (process.env.NODE_ENV === 'development') console.error(e)
  kill()
})

process.on('beforeExit', kill)

export const runCommand = async (string, options, hooks = createNoOpHooks()) => {
  const splitCommand = string.split(' ')
  const [command, ...args] = splitCommand
  await spawnProcess(command, args, options, hooks)
}

export const spawnProcess = (command, args, { env = {}, opts = {}, cwd, label } = {}, hooks = createNoOpHooks()) => {
  return new Promise(async resolve => {

    label = label || command

    // NOTE: We don't need this in production builds...
    const customPath = `${process.cwd()}/node_modules/.bin` // Include this library's node_modules in the PATH

    const proc = spawn(command, args, {
      shell: true,
      env: {
        ...env,
        PATH: `${process.env.PATH}:${customPath}`,
      },
      cwd,
    })

    children[proc.pid] = proc

    // Process output is handled by the service management system
    // Individual process logs are no longer logged to console
    if (opts.log !== false) {
      proc.stdout.on('data', (data) => hooks.emit({ type: 'service:stdout', data, service: label }))
      proc.stderr.on('data', (data) => hooks.emit({ type: 'service:stderr', data, service: label }))
      proc.on('error', (error) => hooks.emit({ type: 'service:error', error, service: label }))
    }

    proc.on('exit', res => {
      delete children[proc.pid]
      // hooks.emit({ type: 'service:exit', code: res, service: label })
      resolve(res)
    })
  })
}

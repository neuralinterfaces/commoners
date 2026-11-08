import { spawn } from 'node:child_process'
import { createNoOpHooks } from '../ui.js'
import { createLogger } from '../assets/utils/logger.js'

const logger = createLogger('processes')

const children = {}

const kill = _code => {
  for (const child in children) children[child].kill()
}

// Ensure all processes are killed. Registering this listener replaces Node's default handling
// (print the error, exit 1), so it must do both itself: otherwise every crash would end silently
// with exit code 0. The in-process test harness (__COMMONERS_TESTING) leaves exiting to its runner
process.on('uncaughtException', e => {
  kill()
  console.error(e)
  if (!process.env.__COMMONERS_TESTING) process.exit(1)
})

process.on('beforeExit', kill)

// Variables a build toolchain needs to find the user's home, temp dir, locale and installed
// toolchains (e.g. cargo via rustup). Commands only inherit this allowlist from the parent
// environment, plus whatever the caller passes in `env`: tokens and other secrets that happen to
// be exported in the developer's shell are not handed to every build script.
export const BASE_ENV_KEYS = [
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'RUSTUP_TOOLCHAIN',
  // Windows: processes cannot start, or cannot find the user's profile, without these
  'SYSTEMROOT',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'ComSpec',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
]

export const getBaseEnv = (source = process.env) =>
  BASE_ENV_KEYS.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key]
    return acc
  }, {})

export const runCommand = async (string, options, hooks = createNoOpHooks()) => {
  const splitCommand = string.split(' ')
  const [command, ...args] = splitCommand
  await spawnProcess(command, args, options, hooks)
}

export const spawnProcess = (
  command,
  args,
  { env = {}, opts = {}, cwd, label } = {},
  hooks = createNoOpHooks()
) => {
  // eslint-disable-next-line no-async-promise-executor -- dropping async would change behaviour: a sync throw from spawn() would then reject this promise instead of leaving it pending
  return new Promise(async resolve => {
    label = label || command

    // NOTE: We don't need this in production builds...
    const customPath = `${process.cwd()}/node_modules/.bin` // Include this library's node_modules in the PATH

    const proc = spawn(command, args, {
      shell: true,
      env: {
        ...getBaseEnv(),
        ...env,
        PATH: `${process.env.PATH}:${customPath}`,
      },
      cwd,
    })

    children[proc.pid] = proc

    // Cleanup function to remove process and listeners
    const cleanup = res => {
      delete children[proc.pid]
      // Remove all listeners to prevent memory leaks
      proc.removeAllListeners()
      if (proc.stdout) proc.stdout.removeAllListeners()
      if (proc.stderr) proc.stderr.removeAllListeners()
      resolve(res)
    }

    // Process output is handled by the service management system
    // Individual process logs are no longer logged to console
    if (opts.log !== false) {
      proc.stdout?.on('data', data => {
        logger.debug('Emitting service:stdout', { service: label })
        hooks.emit({ type: 'service:stdout', data, service: label })
      })
      proc.stderr?.on('data', data => {
        logger.debug('Emitting service:stderr', { service: label })
        hooks.emit({ type: 'service:stderr', data, service: label })
      })
      proc.on('error', error => {
        logger.debug('Emitting service:error', { service: label, error: error.message })
        hooks.emit({ type: 'service:error', error, service: label })
      })
    }

    // Handle both exit and close to ensure cleanup
    proc.once('exit', cleanup)
    proc.once('close', cleanup)
    proc.once('error', cleanup)
  })
}

/**
 * Registry of child processes (services, Electron) spawned by a running CLI.
 *
 * If the CLI is killed without a chance to clean up (SIGKILL, crash, closed terminal),
 * its children are reparented and keep running. The next run reads this registry to
 * find and stop them. Anchored to the project root — never the working directory.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

type RegisteredProcess = { pid: number; command: string }
type Registry = Record<string, RegisteredProcess>

export const registryPath = (root: string) => join(root, '.commoners', '.tmp', 'processes.json')

const read = (root: string): Registry => {
  const path = registryPath(root)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {} // A corrupt registry has nothing trustworthy to act on
  }
}

// Never fatal (a packaged app's root may be read-only), but never silent either
const write = (root: string, registry: Registry) => {
  const path = registryPath(root)
  try {
    if (Object.keys(registry).length === 0) {
      if (existsSync(path)) unlinkSync(path)
      return
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(registry, null, 2), 'utf8')
  } catch (error) {
    console.warn(
      `[commoners] Could not update the process registry at ${path} — orphaned processes ` +
        `will not be cleaned up after a crash: ${(error as Error).message}`
    )
  }
}

export const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM' // Exists, owned by someone else
  }
}

// PIDs are recycled — only act on a live PID that is still running the recorded program
const isSameProgram = (pid: number, command: string) => {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
      })
      return output.toLowerCase().includes(basename(command).toLowerCase())
    }
    const output = execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
    })
    return output.includes(command)
  } catch {
    return false
  }
}

export const registerProcess = (root: string, label: string, pid: number, command: string) => {
  const registry = read(root)
  registry[label] = { pid, command }
  write(root, registry)
}

export const unregisterProcess = (root: string, label: string) => {
  const registry = read(root)
  if (!(label in registry)) return
  delete registry[label]
  write(root, registry)
}

/** Stop every registered process that is still running its recorded program. Returns their labels. */
export const killRegisteredProcesses = (
  root: string,
  filter: (label: string) => boolean = () => true
) => {
  const registry = read(root)
  const killed: string[] = []

  for (const [label, { pid, command }] of Object.entries(registry)) {
    if (!filter(label)) continue
    delete registry[label]
    if (!isProcessAlive(pid) || !isSameProgram(pid, command)) continue
    try {
      process.kill(pid, 'SIGTERM')
      killed.push(label)
    } catch {
      // Exited in between
    }
  }

  write(root, registry)
  return killed
}

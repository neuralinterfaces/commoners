import { execSync } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'

export interface PidTree {
  pid: number
  ppid: number
  children?: PidTree[]
}

/**
 * Gracefully kill a process tree, waiting for exit before forcing.
 * On Windows, uses taskkill (/T /F) which is inherently non-graceful.
 */
export async function treeKillGracefully(pid: number, timeout: number = 3000) {
  if (process.platform === 'win32') {
    try {
      // Confirm the process exists
      const output = execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf8' })
      if (!output.includes(`${pid}`)) return // Process doesn't exist

      // Kill the whole process tree forcibly
      execSync(`taskkill /PID ${pid} /T /F`)
    } catch (err) {
      // Swallow errors like "no such process"
    }
  } else {
    const tree = pidTree({ pid, ppid: process.pid })
    await killTreeGracefully(tree, timeout)
  }
}

/**
 * Recursively build process tree.
 */
export function pidTree(tree: PidTree): PidTree {
  const command = process.platform === 'darwin'
    ? `pgrep -P ${tree.pid}` // Mac
    : `ps -o pid --no-headers --ppid ${tree.pid}` // Linux

  try {
    const childs = execSync(command, { encoding: 'utf8' })
      .match(/\d+/g)
      ?.map(id => +id)

    if (childs) {
      tree.children = childs.map(cid => pidTree({ pid: cid, ppid: tree.pid }))
    }
  } catch {
    // If command fails, assume no children
  }

  return tree
}

/**
 * Kill a single process tree node with grace period and fallback.
 */
export async function killTreeGracefully(tree: PidTree, timeout: number = 3000): Promise<void> {
  if (tree.children) {
    for (const child of tree.children) await killTreeGracefully(child, timeout)
  }

  try {
    process.kill(tree.pid, 'SIGTERM')
  } catch {
    return // Already dead or invalid PID
  }

  const checkInterval = 100
  const maxChecks = Math.ceil(timeout / checkInterval)

  for (let i = 0; i < maxChecks; i++) {
    await wait(checkInterval)
    try {
      process.kill(tree.pid, 0) // Still alive
    } catch {
      return // Process has exited
    }
  }

  try {
    process.kill(tree.pid, 'SIGKILL') // Force kill
  } catch {
    // Process may have exited in the meantime
  }
}
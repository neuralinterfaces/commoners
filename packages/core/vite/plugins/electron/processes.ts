import { execSync } from 'node:child_process'

export interface PidTree {
  pid: number
  ppid: number
  children?: PidTree[]
}

/**
 * Gracefully kill a process tree, waiting for exit before forcing.
 * On Windows, uses taskkill (/T /F) which is inherently non-graceful.
 */
export async function treeKillGracefully(pid: number) {
  if (process.platform === 'win32') {
    try {
      // Confirm the process exists
      const output = execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf8' })
      if (!output.includes(`${pid}`)) return
      execSync(`taskkill /PID ${pid} /T /F`) // Kill the whole process tree forcibly
    } catch (err) {}
  } else {
    const tree = pidTree({ pid, ppid: process.pid })
    await killTreeGracefully(tree)
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

    if (childs) tree.children = childs.map(cid => pidTree({ pid: cid, ppid: tree.pid }))

  } catch { } // Assume no children if command fails

  return tree
}

/**
 * Kill a single process tree node with grace period and fallback.
 */
export async function killTreeGracefully(tree: PidTree): Promise<void> {
  if (tree.children) {
    for (const child of tree.children) await killTreeGracefully(child)
  }

  try { process.kill(tree.pid, 'SIGTERM') } catch { } // Already dead or invalid PID
}
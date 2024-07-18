// From vite-plugin-electron: https://github.com/electron-vite/vite-plugin-electron/blob/main/src/utils.ts#L13

import { execSync } from 'node:child_process'

export interface PidTree {
    pid: number
    ppid: number
    children?: PidTree[]
  }

/**
 * Inspired `tree-kill`, implemented based on sync-api. #168
 * @see https://github.com/pkrumins/node-tree-kill/blob/v1.2.2/index.js
 */
export function treeKillSync(pid: number) {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`)
    } else {
      killTree(pidTree({ pid, ppid: process.pid }))
    }
  }
  
  export function pidTree(tree: PidTree) {
    const command = process.platform === 'darwin'
      ? `pgrep -P ${tree.pid}` // Mac
      : `ps -o pid --no-headers --ppid ${tree.ppid}` // Linux
  
    try {
      const childs = execSync(command, { encoding: 'utf8' })
        .match(/\d+/g)
        ?.map(id => +id)
  
      if (childs) {
        tree.children = childs.map(cid => pidTree({ pid: cid, ppid: tree.pid }))
      }
    } catch { }
  
    return tree
  }
  
  export function killTree(tree: PidTree) {
    if (tree.children) {
      for (const child of tree.children) {
        killTree(child)
      }
    }
  
    try {
      process.kill(tree.pid) // #214
    } catch { /* empty */ }
  }
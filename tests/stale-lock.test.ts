import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { spawn, ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  registerProcess,
  unregisterProcess,
  killRegisteredProcesses,
  registryPath,
} from '../packages/core/assets/utils/process-registry'
import { handleTemporaryDirectories } from '../packages/core/globals'

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const waitFor = async (check: () => boolean, ms = 3000) => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (check()) return true
    await new Promise(r => setTimeout(r, 50))
  }
  return check()
}

// A PID that is not running: spawn and reap a short-lived process
const deadPid = async () => {
  const p = spawn(process.execPath, ['-e', ''])
  await new Promise(r => p.once('exit', r))
  return p.pid!
}

let root: string
let children: ChildProcess[] = []

const spawnSleeper = () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  children.push(child)
  return child
}

beforeEach(() => {
  root = join(tmpdir(), `commoners-stale-lock-${process.pid}-${Date.now()}`)
  mkdirSync(root, { recursive: true })
})

afterEach(() => {
  children.forEach(c => c.kill('SIGKILL'))
  children = []
  rmSync(root, { recursive: true, force: true })
})

describe('process registry', () => {
  test('is anchored to the project root, not the working directory', () => {
    expect(registryPath(root)).toBe(join(root, '.commoners', '.tmp', 'processes.json'))
  })

  test('registers and unregisters processes', () => {
    registerProcess(root, 'service:http', 1234, 'node')
    registerProcess(root, 'electron', 5678, 'Electron')
    unregisterProcess(root, 'service:http')
    const registry = JSON.parse(readFileSync(registryPath(root), 'utf8'))
    expect(Object.keys(registry)).toEqual(['electron'])
    expect(registry.electron.pid).toBe(5678)
  })

  test('kills registered processes that are still running, and clears the registry', async () => {
    const child = spawnSleeper()
    registerProcess(root, 'service:sleeper', child.pid!, process.execPath)

    const killed = killRegisteredProcesses(root)

    expect(killed).toEqual(['service:sleeper'])
    expect(await waitFor(() => !isAlive(child.pid!))).toBe(true)
    expect(existsSync(registryPath(root))).toBe(false)
  })

  // PIDs are recycled: never kill a live PID that is no longer the recorded program
  test('does not kill a live PID whose command no longer matches', async () => {
    const child = spawnSleeper()
    registerProcess(root, 'service:recycled', child.pid!, '/not/the/same/program')

    const killed = killRegisteredProcesses(root)

    expect(killed).toEqual([])
    expect(isAlive(child.pid!)).toBe(true)
  })
})

describe('stale development lock', () => {
  const writeLock = (pid?: number) => {
    const tempDir = join(root, '.commoners', '.tmp')
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(
      join(tempDir, 'commoners.metadata.json'),
      JSON.stringify({ createdAt: new Date().toISOString(), tempDir, pid })
    )
  }

  test('a lock held by a live CLI still blocks a second run', async () => {
    writeLock(process.pid)
    await expect(
      handleTemporaryDirectories({ root }, false, { cleanupOnExit: false })
    ).rejects.toThrow('Active development build detected')
  })

  test('a lock left by a dead CLI is reclaimed and its processes are killed', async () => {
    const orphan = spawnSleeper()
    writeLock(await deadPid())
    registerProcess(root, 'service:orphan', orphan.pid!, process.execPath)

    const result = await handleTemporaryDirectories({ root }, false, { cleanupOnExit: false })

    expect(await waitFor(() => !isAlive(orphan.pid!))).toBe(true)
    const metadata = JSON.parse(
      readFileSync(join(root, '.commoners', '.tmp', 'commoners.metadata.json'), 'utf8')
    )
    expect(metadata.pid).toBe(process.pid)
    result.close()
  })

  // Locks written before PIDs were recorded have no owner to check
  test('a legacy lock without a pid is treated as stale', async () => {
    writeLock(undefined)
    const result = await handleTemporaryDirectories({ root }, false, { cleanupOnExit: false })
    expect(result).toHaveProperty('close')
    result.close()
  })
})

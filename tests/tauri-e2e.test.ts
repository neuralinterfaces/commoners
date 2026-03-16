/**
 * Tauri E2E Test
 *
 * Builds the demo app as a Tauri desktop target, launches it via
 * tauri-driver (WebDriver), and verifies the commoners global is
 * available in the window.
 *
 * Prerequisites:
 * - Rust toolchain (rustc, cargo)
 * - cargo install tauri-driver
 * - webdriverio npm package
 * - @tauri-apps/cli
 *
 * This test is slow (~2-5 minutes for build) and skipped in CI
 * unless TAURI_E2E=1 is set.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const projectBase = join(__dirname, '..', 'examples', 'demo')

// Skip unless explicitly enabled (build is expensive)
const enabled = process.env.TAURI_E2E === '1'

const hasRust = (() => {
  try {
    execSync('rustc --version', { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
})()

const hasTauriDriver = (() => {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    return (
      existsSync(join(home, '.cargo', 'bin', 'tauri-driver.exe')) ||
      existsSync(join(home, '.cargo', 'bin', 'tauri-driver'))
    )
  } catch {
    return false
  }
})()

const describeFn = enabled && hasRust && hasTauriDriver ? describe : describe.skip

describeFn('Tauri E2E (demo app)', () => {
  const output: any = { cleanup: () => {} }

  beforeAll(
    async () => {
      const { build, open } = await import('@commoners/testing')

      // Build the demo app as Tauri
      const buildResult = await build(projectBase, { target: 'tauri' })

      // Launch via tauri-driver
      const openResult = await open(projectBase, { target: 'tauri' }, true)
      Object.assign(output, { ...openResult, buildCleanup: buildResult.cleanup })
    },
    10 * 60 * 1000 // 10 min timeout for build
  )

  afterAll(async () => {
    await output.cleanup?.()
    await output.buildCleanup?.()
  })

  test('App window loads successfully', async () => {
    const url = await output.page.url()
    expect(url).toBeTruthy()
  })

  test('Commoners global is available', async () => {
    const hasCommoners = await output.page.evaluate(() => {
      return typeof (globalThis as any).commoners !== 'undefined'
    })
    expect(hasCommoners).toBe(true)
  })

  test('App name matches config', async () => {
    const name = await output.page.evaluate(() => {
      return (globalThis as any).commoners?.NAME
    })
    expect(name).toContain('Commoners')
  })

  test('TARGET is tauri', async () => {
    const target = await output.page.evaluate(() => {
      return (globalThis as any).commoners?.TARGET
    })
    expect(target).toBe('tauri')
  })

  test('DESKTOP flag is set', async () => {
    const desktop = await output.page.evaluate(() => {
      const c = (globalThis as any).commoners
      return c?.DESKTOP ? true : false
    })
    expect(desktop).toBe(true)
  })

  test('PROD is true in built app', async () => {
    const prod = await output.page.evaluate(() => {
      return (globalThis as any).commoners?.PROD
    })
    expect(prod).toBe(true)
  })
})

// Standalone test that just verifies prerequisites without building
describe('Tauri E2E prerequisites', () => {
  test('Rust toolchain is available', () => {
    expect(hasRust).toBe(true)
  })

  test('tauri-driver is installed', () => {
    expect(hasTauriDriver).toBe(true)
  })

  test.skipIf(!hasRust)('Tauri CLI is available', () => {
    const version = execSync('npx tauri --version', {
      encoding: 'utf8',
      timeout: 30000,
      cwd: projectBase,
    }).trim()
    expect(version).toMatch(/\d+\.\d+/)
  })
})

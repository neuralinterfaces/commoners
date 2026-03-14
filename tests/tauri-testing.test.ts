import { describe, test, expect, vi } from 'vitest'

import { isTauri } from '@commoners/solidarity'

// Import adapter utilities directly (not via dist)
import { createPageProxy, waitForPort } from '../packages/testing/src/tauri'

// ────────────────────────────────────────────────────────
// 1. isTauri target detection
// ────────────────────────────────────────────────────────

describe('isTauri target detection', () => {
  test('recognizes tauri as Tauri', () => {
    expect(isTauri('tauri')).toBe(true)
  })

  test('recognizes ios-tauri as Tauri', () => {
    expect(isTauri('ios-tauri')).toBe(true)
  })

  test('recognizes android-tauri as Tauri', () => {
    expect(isTauri('android-tauri')).toBe(true)
  })

  test('rejects electron', () => {
    expect(isTauri('electron')).toBe(false)
  })

  test('rejects web', () => {
    expect(isTauri('web')).toBe(false)
  })

  test('rejects ios-capacitor', () => {
    expect(isTauri('ios-capacitor')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────
// 2. createPageProxy wraps evaluate correctly
// ────────────────────────────────────────────────────────

describe('createPageProxy', () => {
  test('evaluate delegates to browser.execute with function', async () => {
    const mockBrowser = {
      execute: vi.fn().mockResolvedValue(42),
      getUrl: vi.fn().mockResolvedValue('http://localhost:1420'),
      url: vi.fn().mockResolvedValue(undefined),
    }

    const page = createPageProxy(mockBrowser)
    const result = await page.evaluate(() => 42)

    expect(mockBrowser.execute).toHaveBeenCalledTimes(1)
    expect(result).toBe(42)
  })

  test('evaluate delegates to browser.execute with string', async () => {
    const mockBrowser = {
      execute: vi.fn().mockResolvedValue('hello'),
      getUrl: vi.fn(),
      url: vi.fn(),
    }

    const page = createPageProxy(mockBrowser)
    const result = await page.evaluate('return "hello"')

    expect(mockBrowser.execute).toHaveBeenCalledWith('return "hello"')
    expect(result).toBe('hello')
  })

  test('url delegates to browser.getUrl', async () => {
    const mockBrowser = {
      execute: vi.fn(),
      getUrl: vi.fn().mockResolvedValue('http://localhost:1420'),
      url: vi.fn(),
    }

    const page = createPageProxy(mockBrowser)
    const result = await page.url()

    expect(mockBrowser.getUrl).toHaveBeenCalledTimes(1)
    expect(result).toBe('http://localhost:1420')
  })

  test('goto delegates to browser.url', async () => {
    const mockBrowser = {
      execute: vi.fn(),
      getUrl: vi.fn(),
      url: vi.fn().mockResolvedValue(undefined),
    }

    const page = createPageProxy(mockBrowser)
    await page.goto('http://localhost:1420/test')

    expect(mockBrowser.url).toHaveBeenCalledWith('http://localhost:1420/test')
  })

  test('waitForFunction resolves when condition is true', async () => {
    let callCount = 0
    const mockBrowser = {
      execute: vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve(callCount >= 3)
      }),
      getUrl: vi.fn(),
      url: vi.fn(),
    }

    const page = createPageProxy(mockBrowser)
    await page.waitForFunction(() => true, { polling: 10 })

    expect(callCount).toBeGreaterThanOrEqual(3)
  })

  test('waitForFunction throws on timeout', async () => {
    const mockBrowser = {
      execute: vi.fn().mockResolvedValue(false),
      getUrl: vi.fn(),
      url: vi.fn(),
    }

    const page = createPageProxy(mockBrowser)
    await expect(
      page.waitForFunction(() => false, { timeout: 100, polling: 20 })
    ).rejects.toThrow('timed out')
  })
})

// ────────────────────────────────────────────────────────
// 3. waitForPort utility
// ────────────────────────────────────────────────────────

describe('waitForPort', () => {
  test('rejects when port is not bound within timeout', async () => {
    // Use a port that is very unlikely to be in use
    await expect(waitForPort(59999, 500)).rejects.toThrow('not reachable')
  })
})

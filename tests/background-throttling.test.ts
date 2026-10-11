import { describe, test, expect } from 'vitest'

import { parseOptions } from '../packages/core/assets/electron/modules/config'
import {
  generateTauriConf,
  generateDevTauriConf,
} from '../packages/core/flows/strategies/tauri-templates'

// Verified on macOS: with throttling on, a hidden window's Worker sending at 60 Hz
// dropped to ~19 Hz with p95 latency of 28 ms
describe('desktop.backgroundThrottling', () => {
  const electronConfig = (desktop?: any, window?: any) =>
    ({ config: { desktop }, electron: { window }, plugins: {}, hooks: {} }) as any

  test('Electron: false disables throttling in webPreferences, keeping user preferences', () => {
    const { windowOptions } = parseOptions(
      electronConfig({ backgroundThrottling: false }, { webPreferences: { spellcheck: false } })
    )
    expect(windowOptions.webPreferences).toEqual({ spellcheck: false, backgroundThrottling: false })
  })

  test('Electron: unset leaves webPreferences alone', () => {
    const { windowOptions } = parseOptions(electronConfig(undefined, {}))
    expect(windowOptions.webPreferences).toBeUndefined()
  })

  const base = {
    name: 'app',
    appId: '',
    version: '1.0.0',
    icon: null,
    tauriConfig: {},
    electronWindow: {},
    externalBins: [],
  }

  test('Tauri: false disables throttling on the window (build and dev)', () => {
    expect(
      generateTauriConf({ ...base, backgroundThrottling: false }).app.windows[0]
        .backgroundThrottling
    ).toBe('disabled')
    expect(
      generateDevTauriConf({
        name: 'app',
        devUrl: 'http://localhost:1',
        backgroundThrottling: false,
      }).app.windows[0].backgroundThrottling
    ).toBe('disabled')
  })

  test('Tauri: unset leaves the default', () => {
    expect(generateTauriConf(base).app.windows[0].backgroundThrottling).toBeUndefined()
  })
})

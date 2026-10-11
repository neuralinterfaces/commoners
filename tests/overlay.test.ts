import { describe, test, expect, vi } from 'vitest'

import {
  resolveOverlay,
  electronOverlayWindowOptions,
  applyElectronOverlay,
  tauriOverlayWindowConfig,
} from '../packages/core/assets/utils/overlay'
import {
  generateTauriConf,
  generateMainRs,
  generateCargoToml,
} from '../packages/core/flows/strategies/tauri-templates'
import { ELECTRON_CONFIG_KEYS } from '../packages/core/utils/assets'

describe('resolveOverlay', () => {
  test('is off unless requested', () => {
    expect(resolveOverlay(undefined)).toBeNull()
    expect(resolveOverlay(false)).toBeNull()
  })

  test('true enables every overlay behaviour', () => {
    expect(resolveOverlay(true)).toEqual({
      clickThrough: true,
      alwaysOnTop: true,
      allWorkspaces: true,
      coverDisplay: true,
    })
  })

  test('options override individual defaults', () => {
    expect(resolveOverlay({ clickThrough: false })).toEqual({
      clickThrough: false,
      alwaysOnTop: true,
      allWorkspaces: true,
      coverDisplay: true,
    })
  })
})

describe('Electron overlay', () => {
  test('window is transparent and frameless, and not focusable when click-through', () => {
    const options = electronOverlayWindowOptions(resolveOverlay(true)!)
    expect(options).toMatchObject({
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      focusable: false,
      enableLargerThanScreen: true, // Otherwise macOS clamps the bounds below the menu bar
    })
    expect(electronOverlayWindowOptions(resolveOverlay({ clickThrough: false })!).focusable).toBe(
      true
    )
  })

  test('applies always-on-top, all workspaces, click-through and display bounds', () => {
    const win = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setBounds: vi.fn(),
    }
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
    const screen = { getPrimaryDisplay: () => ({ bounds }) }

    applyElectronOverlay(win as any, resolveOverlay(true)!, screen as any)

    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
    expect(win.setBounds).toHaveBeenCalledWith(bounds)
  })

  test('skips behaviours that are turned off', () => {
    const win = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setBounds: vi.fn(),
    }
    const overlay = resolveOverlay({
      clickThrough: false,
      alwaysOnTop: false,
      allWorkspaces: false,
      coverDisplay: false,
    })!
    applyElectronOverlay(win as any, overlay, { getPrimaryDisplay: () => ({}) } as any)
    for (const fn of Object.values(win)) expect(fn).not.toHaveBeenCalled()
  })

  // Without this, the main process never sees config.desktop
  test('the desktop key survives into the Electron config bundle', () => {
    expect(ELECTRON_CONFIG_KEYS).toContain('desktop')
  })
})

describe('Tauri overlay', () => {
  const base = {
    name: 'app',
    appId: '',
    version: '1.0.0',
    icon: null,
    tauriConfig: {},
    electronWindow: {},
    externalBins: [],
  }

  test('window config is transparent, undecorated and pinned', () => {
    expect(tauriOverlayWindowConfig(resolveOverlay(true)!)).toMatchObject({
      transparent: true,
      decorations: false,
      shadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      focus: false,
      visible: false, // Shown from main.rs once the macOS level and Space behaviour are set
    })
  })

  test('tauri.conf.json applies the overlay and enables the macOS private API', () => {
    const conf = generateTauriConf({ ...base, overlay: resolveOverlay(true) })
    expect(conf.app.windows[0]).toMatchObject({
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
    })
    expect(conf.app.macOSPrivateApi).toBe(true)
  })

  test('no overlay leaves the window and private API untouched', () => {
    const conf = generateTauriConf(base)
    expect(conf.app.windows[0].transparent).toBeUndefined()
    expect(conf.app.macOSPrivateApi).toBeUndefined()
  })

  test('Cargo.toml enables macos-private-api and objc2 only for overlays', () => {
    const toml = generateCargoToml('app', { overlay: true })
    expect(toml).toContain('features = ["macos-private-api"]')
    expect(toml).toContain(`[target.'cfg(target_os = "macos")'.dependencies]`)
    expect(toml).toContain('objc2 = "0.6"')
    expect(generateCargoToml('app')).not.toContain('macos-private-api')
    expect(generateCargoToml('app')).not.toContain('objc2')
  })

  test('main.rs makes the window click-through and covers the primary monitor', () => {
    for (const services of [[], [{ id: 'http', bin: 'binaries/http' }]]) {
      const rs = generateMainRs(services, { overlay: resolveOverlay(true) })
      expect(rs).toContain('set_ignore_cursor_events(true)')
      expect(rs).toContain('primary_monitor()')
    }
  })

  // Verified on macOS: without these the window sits at level 5, clamped below the menu bar
  test('main.rs raises the window to screen-saver level on every Space, then shows it', () => {
    const rs = generateMainRs([], { overlay: resolveOverlay(true) })
    expect(rs).toContain('setLevel: 1000isize')
    expect(rs).toContain('setCollectionBehavior:')
    expect(rs).toContain('ActivationPolicy::Accessory')
    expect(rs).toContain('window.show()')
  })

  // Verified on macOS: only a non-activating NSPanel appears over another app's fullscreen Space
  test('a click-through overlay becomes a non-activating panel to float over fullscreen apps', () => {
    const rs = generateMainRs([], { overlay: resolveOverlay(true) })
    expect(rs).toContain('object_setClass(ns_window, class!(NSPanel))')
    expect(rs).toContain('NSWindowStyleMaskNonactivatingPanel')
  })

  // A plain NSPanel cannot become key, so interactive overlays keep their window class
  test('an interactive overlay is not converted to a panel', () => {
    const rs = generateMainRs([], { overlay: resolveOverlay({ clickThrough: false }) })
    expect(rs).toContain('setLevel: 1000isize')
    expect(rs).not.toContain('NSPanel')
  })

  test('main.rs has no overlay code without an overlay', () => {
    expect(generateMainRs([])).not.toContain('set_ignore_cursor_events')
    expect(
      generateMainRs([], { overlay: resolveOverlay({ clickThrough: false, coverDisplay: false }) })
    ).not.toContain('set_ignore_cursor_events')
  })
})

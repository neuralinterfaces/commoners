/**
 * Desktop overlay: a transparent, frameless main window that floats above other apps,
 * optionally click-through and covering the primary display. Shared by the Electron
 * main process and the Tauri templates so both backends behave the same.
 */

export type OverlayOptions = {
  clickThrough?: boolean // Mouse events pass to the apps underneath (hover still forwarded on Electron)
  alwaysOnTop?: boolean
  allWorkspaces?: boolean // Visible on every space / virtual desktop, including over fullscreen apps
  coverDisplay?: boolean // Size the window to the primary display
}

export type ResolvedOverlay = Required<OverlayOptions>

const DEFAULTS: ResolvedOverlay = {
  clickThrough: true,
  alwaysOnTop: true,
  allWorkspaces: true,
  coverDisplay: true,
}

export const resolveOverlay = (overlay?: boolean | OverlayOptions): ResolvedOverlay | null => {
  if (!overlay) return null
  return { ...DEFAULTS, ...(overlay === true ? {} : overlay) }
}

// ------------------------ Electron ------------------------

export const electronOverlayWindowOptions = (overlay: ResolvedOverlay) => ({
  frame: false,
  transparent: true,
  hasShadow: false,
  skipTaskbar: true,
  backgroundColor: '#00000000',
  focusable: !overlay.clickThrough, // A click-through overlay should never steal focus
  enableLargerThanScreen: true, // Otherwise macOS clamps the bounds below the menu bar
})

type OverlayWindow = {
  setAlwaysOnTop: (flag: boolean, level?: any) => void
  setVisibleOnAllWorkspaces: (flag: boolean, options?: any) => void
  setIgnoreMouseEvents: (ignore: boolean, options?: any) => void
  setBounds: (bounds: any) => void
}

type OverlayScreen = { getPrimaryDisplay: () => { bounds: any } }

export const applyElectronOverlay = (
  win: OverlayWindow,
  overlay: ResolvedOverlay,
  screen: OverlayScreen
) => {
  if (overlay.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver') // Above fullscreen apps on macOS
  if (overlay.allWorkspaces) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (overlay.clickThrough) win.setIgnoreMouseEvents(true, { forward: true })
  if (overlay.coverDisplay) win.setBounds(screen.getPrimaryDisplay().bounds)
}

// ------------------------ Tauri ------------------------

// Window entry fields for tauri.conf.json; click-through and display bounds are set in main.rs
export const tauriOverlayWindowConfig = (overlay: ResolvedOverlay) => ({
  transparent: true,
  decorations: false,
  shadow: false,
  skipTaskbar: true,
  alwaysOnTop: overlay.alwaysOnTop,
  visibleOnAllWorkspaces: overlay.allWorkspaces,
  focus: !overlay.clickThrough,
  visible: false, // Shown from main.rs once the macOS level and Space behaviour are set
})

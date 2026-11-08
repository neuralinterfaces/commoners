// A transparent, click-through window that floats above every other app.
// The same config produces the overlay on Electron and Tauri:
//   commoners build --target electron   |   commoners build --target tauri
export default {
  name: 'Commoners Overlay',
  target: 'desktop',
  icon: './icon.png',
  desktop: {
    overlay: true, // or { clickThrough, alwaysOnTop, allWorkspaces, coverDisplay }
  },
}

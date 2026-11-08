// Packaged desktop pages served from app://local instead of file://: a real origin, a
// header CSP, and cross-origin isolation (SharedArrayBuffer) on Electron as on the web
export default {
  name: 'App Origin',
  icon: './icon.png',
  electron: { origin: process.env.APP_ORIGIN_MODE === 'file' ? 'file' : 'app' },
  security: { crossOriginIsolation: true },
  services: { echo: './service.js' },
}

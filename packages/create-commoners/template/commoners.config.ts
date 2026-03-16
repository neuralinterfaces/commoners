import { join } from 'node:path'

import { getDirname, defineConfig } from '@commoners/solidarity/config'

import splashPagePlugin from '@commoners/splash-screen'

const root = getDirname(import.meta.url)

const name = 'My Commoners App'

export default defineConfig({
  name,
  icon: join(root, 'icon.png'),

  pages: {
    home: join(root, 'index.html'),
    services: join(root, 'pages', 'services', 'index.html'),
  },

  plugins: {
    splash: splashPagePlugin(join(root, 'splash.html')),

    platform: {
      load: () => console.log('Platform plugin loaded'),
      desktop: {
        load: () => console.log('Running on desktop'),
      },
    },
  },

  services: {
    http: {
      src: join(root, 'src/services/http/index.ts'),
      port: 3001,
    },
  },

  electron: {
    window: {
      width: 1200,
      height: 800,
    },
  },

  pwa: {
    manifest: {
      short_name: name,
    },
  },
})

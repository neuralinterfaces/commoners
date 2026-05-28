import url from 'node:url'
import { join, resolve } from 'node:path'
import { normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import dts from 'vite-plugin-dts'
import { createPackageConfig } from '../../vite.config.shared'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const toCopy = [join('assets')]

const additionalPlugins = [
  dts(),
  viteStaticCopy({
    targets: [
      {
        src: normalizePath(resolve(__dirname, 'package.json')),
        dest: './',
      },
      // NOTE: All of these are required for now to resolve template builds
      ...toCopy.map(path => ({
        src: normalizePath(resolve(__dirname, path)) + '/[!.]*',
        dest: join(path),
      })),
    ],
  }),
]

export default createPackageConfig({
  entryPoint: {
    main: 'index.ts',
    services: 'services/index.ts',
    ui: 'ui.ts',
    config: 'config.ts',
  },
  packageName: '@commoners/solidarity',
  libraryName: 'solidarity',
  additionalExternal: ['@commoners/solidarity'],
  additionalPlugins,
})

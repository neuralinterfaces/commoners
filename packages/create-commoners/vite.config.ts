import { createPackageConfig } from '../../vite.config.shared'
import { defineConfig } from 'vite'

const baseConfig = createPackageConfig({
  entryPoint: {
    index: 'index.ts'
  },
  packageName: 'create-commoners',
  libraryName: 'create-commoners',
})

export default defineConfig({
  ...baseConfig,
  build: {
    ...baseConfig.build,
    rollupOptions: {
      ...baseConfig.build?.rollupOptions,
      output: {
        ...baseConfig.build?.rollupOptions?.output,
        banner: '#!/usr/bin/env node',
      }
    }
  }
})

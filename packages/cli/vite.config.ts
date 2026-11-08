import { createPackageConfig } from '../../vite.config.shared'
import { defineConfig } from 'vite'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

const baseConfig = createPackageConfig({
  entryPoint: {
    index: 'index.ts',
  },
  packageName: 'commoners',
  libraryName: 'commoners',
  additionalExternal: ['@commoners/solidarity'],
})

// The build rewrites dist/index.cjs without the executable bit. Package managers link `bin`
// straight to it, so a rebuilt local CLI would fail to run and the shell would fall through
// to whatever `commoners` is next on PATH
const executableBin = {
  name: 'commoners-executable-bin',
  writeBundle(options: { dir?: string }, bundle: Record<string, unknown>) {
    if (process.platform === 'win32' || !('index.cjs' in bundle)) return // Runs once per output format
    chmodSync(join(options.dir ?? 'dist', 'index.cjs'), 0o755)
  },
}

export default defineConfig({
  ...baseConfig,
  plugins: [...(baseConfig.plugins ?? []), executableBin],
  build: {
    ...baseConfig.build,
    rollupOptions: {
      ...baseConfig.build?.rollupOptions,
      output: {
        ...baseConfig.build?.rollupOptions?.output,
        banner: '#!/usr/bin/env node',
      },
    },
  },
})

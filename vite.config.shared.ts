import { defineConfig, UserConfigExport } from 'vite'
import url from 'node:url'
import { join, resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { nodeBuiltIns } from './packages/core/utils/config'

interface PackageConfigOptions {
  entryPoint: string | Record<string, string>
  packageName: string
  libraryName: string
  additionalExternal?: string[]
  additionalPlugins?: any[]
  copyAssets?: boolean
}

export function createPackageConfig(options: PackageConfigOptions): UserConfigExport {
  const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

  const pkg = JSON.parse(readFileSync('package.json').toString())

  // Try to read core package.json for shared dependencies
  const corePackagePath = join(__dirname, 'packages', 'core', 'package.json')
  let corePackageDeps: string[] = []
  if (existsSync(corePackagePath)) {
    const corePkg = JSON.parse(readFileSync(corePackagePath).toString())
    corePackageDeps = Object.keys(corePkg.dependencies || {})
  }

  const external = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...corePackageDeps,
    ...nodeBuiltIns,
    ...(options.additionalExternal || []),
  ])

  const plugins = [...(options.additionalPlugins || [])]

  return defineConfig({
    plugins,
    build: {
      target: 'node16',
      minify: 'terser',
      sourcemap: true,
      lib: {
        entry: typeof options.entryPoint === 'string'
          ? resolve(process.cwd(), options.entryPoint)
          : Object.fromEntries(
              Object.entries(options.entryPoint).map(([key, path]) => [
                key,
                resolve(process.cwd(), path)
              ])
            ),
        name: options.libraryName,
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => {
          const extension = format === 'es' ? 'mjs' : 'cjs'
          return entryName ? `${entryName}.${extension}` : `index.${extension}`
        },
      },
      rollupOptions: {
        external: Array.from(external),
        output: {
          // Enable tree shaking
          preserveModules: false,
          // Optimize chunks
          manualChunks: undefined,
        },
      },
    },
    // Performance optimizations
    esbuild: {
      // Enable JSX transform optimization
      jsxInject: undefined,
      // Target modern JavaScript features
      target: 'node16',
    },
    // Enable build caching
    optimizeDeps: {
      include: Array.from(external).filter(dep => !dep.startsWith('node:')),
    },
  })
}
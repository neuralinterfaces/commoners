import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

// Externalize all Node.js builtins (both bare and node:-prefixed) so they
// are not bundled into the library output.
const nodeBuiltins = builtinModules.flatMap(m => [m, `node:${m}`])

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: 'index',
      name: 'local-services',
      formats: ['es', 'cjs'],
      fileName: format => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: nodeBuiltins,
    },
  },
})

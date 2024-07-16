import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'index',
      name: 'serial',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`
    },
  }
})

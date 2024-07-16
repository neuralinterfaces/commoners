import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'index',
      name: 'local-services',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`
    },
  }
})

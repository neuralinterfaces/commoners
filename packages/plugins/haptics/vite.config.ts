import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'index',
      name: 'haptics',
      formats: ['es', 'cjs'],
      fileName: format => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['@capacitor/haptics'],
    },
  },
})

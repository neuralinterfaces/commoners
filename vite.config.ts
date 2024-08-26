import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: { 
    watch: { 
      ignored: [
        "**/package.json"
      ] 
    } 
  },
  test: {
    hookTimeout: 30000,
    coverage: {
      exclude: [
        '**/docs/**', 
        '**/node_modules/**', 
        '**/dist/**', 
        '**/coverage/**', 
        '**/vite.config.ts',
        '**/.commoners/**',
      ],
    }
  },
})
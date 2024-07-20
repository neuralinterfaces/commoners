import { defineConfig } from 'vitest/config'

export default defineConfig({
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
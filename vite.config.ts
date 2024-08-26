import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    hookTimeout: 30000,
    server: { 
      watch: { 
        ignored: ['**/package.json'] 
      } 
    },
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
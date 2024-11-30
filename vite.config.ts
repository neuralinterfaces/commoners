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
    hookTimeout: 2 * 1000 * 60, // Allow 2min for each test
    coverage: {
      exclude: [
        '**/docs/**', 
        '**/node_modules/**', 
        '**/dist/**', 
        '**/coverage/**', 
        '**/vite.config.ts',
        '**/.commoners/**',

        // Packages
        'packages/cli/**',
        'packages/plugins/**',
        'packages/testing/**',
      ],
    }
  },
})
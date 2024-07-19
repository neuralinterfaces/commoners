/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
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
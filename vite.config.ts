import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/package.json'],
    },
  },
  test: {
    hookTimeout: 2 * 1000 * 60, // Allow 2min for each test
    testTimeout: 30000, // Allow 30s for individual tests (service echo, etc.)
    fileParallelism: false, // E2E tests share .commoners/.tmp — run sequentially to avoid races
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'tests/index.test.ts', // Aggregator file — individual test files are discovered directly
    ],
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
    },
  },
})

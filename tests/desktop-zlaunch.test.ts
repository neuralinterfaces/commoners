import { describe } from 'vitest'

import { registerBuildTest } from './utils'

const { platform } = process

const platforms = {
  mac: platform === 'darwin',
}

// Builds the Electron app then launches it for E2E testing.
// Runs AFTER desktop.test.ts (alphabetically) to avoid CDP port conflicts.
describe('Desktop Build + Launch', () => {
  registerBuildTest(
    'Desktop',
    { target: 'electron', launch: true },
    platforms.mac // Skip on non-Mac platforms
  )
})

import { afterAll, describe } from 'vitest'
import { execSync } from 'node:child_process'

import { registerBuildTest } from './utils'

const { platform } = process

const platforms = {
  mac: platform === 'darwin',
}

describe('Desktop Build', () => {
  registerBuildTest(
    'Desktop',
    { target: 'electron', launch: false },
    platforms.mac // Skip on non-Mac platforms
  )

  // Ensure electron-builder's spawned processes are fully cleaned up
  // to avoid port 8315 (CDP) conflicts with subsequent desktop tests
  afterAll(() => {
    try { execSync('lsof -ti :8315 | xargs kill -9', { stdio: 'ignore' }) } catch {}
  })
})

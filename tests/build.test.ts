import { describe } from 'vitest'

import { registerBuildTest } from './utils'

describe.sequential('Build and Launch', () => {
  registerBuildTest('Web', { target: 'web' })
  registerBuildTest('PWA', { target: 'pwa' })
  registerBuildTest('Mobile', { target: 'mobile' }, false)
})

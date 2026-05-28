import { describe } from 'vitest'

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
})

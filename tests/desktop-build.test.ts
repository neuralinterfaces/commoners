import { describe } from 'vitest'

import { registerBuildTest } from './utils'

const { platform } = process

const platforms = {
  mac: platform === 'darwin',
  windows: platform === 'win32',
}

describe('Desktop Build', () => {
  registerBuildTest(
    'Desktop',
    { target: 'electron', launch: false },
    platforms.mac || platforms.windows // Packaged on macOS and Windows
  )
})

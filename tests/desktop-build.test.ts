import { describe } from 'vitest'

import { registerBuildTest, requirePyInstaller } from './utils'

const { platform } = process

const platforms = {
  mac: platform === 'darwin',
  windows: platform === 'win32',
}

describe('Desktop Build', () => {
  const { enabled, skipReason } = requirePyInstaller(platforms.mac || platforms.windows) // Packaged on macOS and Windows
  registerBuildTest('Desktop', { target: 'electron', launch: false }, enabled, skipReason)
})

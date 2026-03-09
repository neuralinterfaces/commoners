import { describe } from 'vitest'

import { registerBuildTest, registerStartTest } from './utils'

const { platform } = process

const platforms = {
  mac: platform === 'darwin',
}

describe.sequential('Desktop Start + Build and Launch', () => {

  // registerBuildTest(
  //   'Desktop',
  //   { target: 'electron' },
  //   platforms.mac // Skip on non-Mac platforms
  // )

  // NOTE: This interferes with Desktop Launch.
  // It seems that cleanup does not fully succeed until the parent process (CLI) is closed
  registerStartTest('Desktop', { target: 'electron' })
})

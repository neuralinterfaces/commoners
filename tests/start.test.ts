import { describe } from 'vitest'

import { registerStartTest } from './utils'

describe.sequential('Start', () => {
  registerStartTest('Web')
  registerStartTest('Mobile', { target: 'mobile' }, true)
})

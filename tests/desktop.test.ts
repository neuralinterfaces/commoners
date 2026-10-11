import { describe } from 'vitest'

import { registerStartTest } from './utils'

describe('Desktop Start', () => {
  registerStartTest('Desktop', { target: 'electron' })
})

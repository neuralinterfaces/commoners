// sum.test.js
import { expect, test, describe } from 'vitest'

import {
    loadConfigFromFile,
    resolveConfigPath,
} from '../index'

import { share } from '../../testing'

import { resolve } from 'node:path'

import { name } from './demo/commoners.config'
import { projectBase, registerBuildTest, registerStartTest, serviceTests } from './utils'


describe('Custom project base is loaded', () => {

  test('Config is resolved', () => {
    const configPath = resolveConfigPath(projectBase)
    expect(configPath).toBe(resolve(projectBase, 'commoners.config.ts'))
  })

  test('Config is loaded', async () => {
    const config = await loadConfigFromFile(projectBase)
    expect(config.name).toBe(name)
  })
})

describe('Start', () => {

  registerStartTest('Web')

  // NOTE: Skipped because I can't close the Electron instance programmatically
  registerStartTest('Desktop', { target: 'electron', skip: true })

  // NOTE: Skipped because Ruby Gems needs to be updated
  registerStartTest('Mobile', { target: 'mobile', skip: true })

})

describe('Share', () => {
  
  describe('Share all services', () => {
    share(projectBase)
    serviceTests.share.basic()
    serviceTests.basic('http')
  })

  describe('Share specific service', () => {

    const service = 'http'

    share(projectBase, { services: [ service ] })

    serviceTests.basic(service)

    // NOTE: Add a check to see if other services fail

  })
})


describe('Build and Launch', () => {
  registerBuildTest('Web', { target: 'web' })
  registerBuildTest('PWA', { target: 'pwa' })
  registerBuildTest('Desktop', { target: 'electron', skip: true })
  registerBuildTest('Mobile', { target: 'mobile', skip: true })
})



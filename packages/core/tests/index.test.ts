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

  registerStartTest(
    'Desktop', 
    { target: 'electron'},
    false // NOTE: Valid test suite—but causes a SIGABRT that results in a crash
  )

  // NOTE: Skipped because Ruby Gems needs to be updated
  registerStartTest('Mobile', { target: 'mobile' }, false)

})

describe('Share', () => {
  
  describe('Share all services', () => {
    const output = share(projectBase)
    serviceTests.share.basic(output)
    serviceTests.echo('http', output)
    serviceTests.echo('express', output)
    serviceTests.echo('manual', output)
  })

  describe('Share specific service', () => {

    const service = 'http'

    const output = share(projectBase, { services: [ service ] })

    serviceTests.echo(service, output)

    // NOTE: Add a check to see if other services fail

  })
})


describe('Build and Launch', () => {
  registerBuildTest('Web', { target: 'web' })
  registerBuildTest('PWA', { target: 'pwa' })

  registerBuildTest(
    'Desktop', 
    { target: 'electron' }
  )

  // registerBuildTest('Mobile', { target: 'mobile' }, false)
})



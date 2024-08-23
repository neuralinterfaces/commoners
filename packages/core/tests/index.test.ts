import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
    loadConfigFromFile,
    resolveConfigPath,
} from '../index'

import { resolve } from 'node:path'

import { name } from './demo/commoners.config'
import { projectBase, registerBuildTest, registerStartTest, serviceTests, sharePort } from './utils'
import { beforeShare } from '../../testing/index'

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
    { target: 'electron'}
  )

  // NOTE: Skipped because Ruby Gems needs to be updated
  registerStartTest('Mobile', { target: 'mobile' }, false)

})

describe('Share', () => {
  
  describe('Share all services', () => {
    const output = {}

    beforeAll(async () => {
      const _output = await beforeShare(projectBase, { port: sharePort })
      Object.assign(output, _output)
    })

    serviceTests.share.basic(output)
    serviceTests.echo('http', output)
    serviceTests.echo('express', output)
    serviceTests.echo('manual', output)

    afterAll(() => output.cleanup())
    
  })

  describe('Share specific service', () => {

    // const services = { active: [ 'http' ], inactive: [ 'express', 'manual'  ] }
    const services = { active: [ 'http', 'manual' ], inactive: [ 'express' ] }


    const output = {}
    beforeAll(async () => {
      const _output = await beforeShare(projectBase, { services: services.active, port: sharePort })
      Object.assign(output, _output)
    })

    services.active.forEach(service => serviceTests.echo(service, output))  
    // services.inactive // NOTE: Add a check to see if other services fail

    afterAll(() => output.cleanup())

  })

})


describe('Build and Launch', () => {
  registerBuildTest('Web', { target: 'web' })
  registerBuildTest('PWA', { target: 'pwa' })

  registerBuildTest(
    'Desktop', 
    { target: 'electron' }
  )

  registerBuildTest('Mobile', { target: 'mobile' }, false)
})



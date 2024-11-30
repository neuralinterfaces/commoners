import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
    loadConfigFromFile,
    resolveConfigPath
} from '@commoners/solidarity'

import { resolve } from 'node:path'
import { existsSync }  from 'node:fs'

import { name } from './demo/commoners.config'
import { EXTRA_OUTPUT_LOCATIONS, projectBase, registerBuildTest, registerStartTest } from './utils'
import { resolveServiceBuildInfo } from '../packages/core/assets/services'
import { build } from '@commoners/testing'


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

describe('Build and Launch', () => {


  registerBuildTest('Web', { target: 'web' })
  registerBuildTest('PWA', { target: 'pwa' })

  registerBuildTest(
    'Desktop', 
    { target: 'electron' }
  )

  registerBuildTest('Mobile', { target: 'mobile' }, false)
})


describe('All services with sources can be built individually', async () => {

    const config = await loadConfigFromFile(projectBase)

    const serviceNames = Object.keys(config.services)

    for (const name of serviceNames) {

      describe(`Check resolved service filepath for ${name}`, () => {

        const service = config.services[name]
        const info = resolveServiceBuildInfo(
          service, 
          name, 
          {
            root: projectBase,
            target: 'service',
            services: true,
            build: true
          }
        )

        // Setup build for testing
        const output = {}


        beforeAll(async () => {
          const __output = await build(projectBase, { build: { services: [ name ] } })
          Object.assign(output, __output)
        })


        // Cleanup build outputs
        afterAll(() =>  output.cleanup(EXTRA_OUTPUT_LOCATIONS))

        test(`Output file has been created`, () => {
          if (info && info.filepath) expect(existsSync(info.filepath), `Output file (${info.filepath}) is not found`).toBe(true)
        })
      })
    }

})
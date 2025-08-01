import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
    loadConfigFromFile,
    resolveConfigPath,
    resolveServiceBuildInfo
} from '@commoners/solidarity'

import { resolve } from 'node:path'
import { existsSync }  from 'node:fs'

import { name } from './demo/commoners.config'
import { EXTRA_OUTPUT_LOCATIONS, projectBase, registerBuildTest, registerStartTest } from './utils'
import { buildServices } from '@commoners/testing'

const platforms = {
  windows: process.platform === 'win32',
  mac: process.platform === 'darwin',
  linux: process.platform === 'linux'
}

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
  registerStartTest('Mobile', { target: 'mobile' }, false) // NOTE: Skipped because Ruby Gems needs to be updated
})


describe('Build and Launch', () => {
  registerBuildTest('Web', { target: 'web' })
  registerBuildTest('PWA', { target: 'pwa' })
  registerBuildTest('Mobile', { target: 'mobile' }, false)
})

describe("Desktop Start + Build and Launch", () => {

  registerBuildTest(
    'Desktop', 
    { target: 'electron' },
    platforms.mac // Skip on non-Mac platforms
  )

  // NOTE: This interferes with Desktop Launch. 
  // It seems that cleanup does not fully succeed until the parent process (CLI) is closed
  registerStartTest(
    'Desktop', 
    { target: 'electron'}
  )

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
          const __output = await buildServices(projectBase, { services: name })
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
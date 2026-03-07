import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
  loadConfigFromFile,
  resolveServiceBuildInfo
} from '@commoners/solidarity'

import { existsSync } from 'node:fs'

import { EXTRA_OUTPUT_LOCATIONS, projectBase } from './utils'
import { buildServices } from '@commoners/testing'

describe('All services with sources can be built individually', async () => {
  const config = await loadConfigFromFile(projectBase)

  const serviceNames = Object.keys(config.services)

  for (const name of serviceNames) {
    describe(`Check resolved service filepath for ${name}`, () => {
      const service = config.services[name]
      const info = resolveServiceBuildInfo(service, name, {
        root: projectBase,
        target: 'service',
        services: true,
        build: true,
      })

      // Setup build for testing
      const output = {}

      beforeAll(async () => {
        const __output = await buildServices(projectBase, { services: name })
        Object.assign(output, __output)
      })

      // Cleanup build outputs
      afterAll(() => output.cleanup(EXTRA_OUTPUT_LOCATIONS))

      test(`Output file has been created`, () => {
        if (info && info.filepath)
          expect(existsSync(info.filepath), `Output file (${info.filepath}) is not found`).toBe(
            true
          )
      })
    })
  }
})

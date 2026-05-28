import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
  loadConfigFromFile,
  resolveServiceBuildInfo
} from '@commoners/solidarity'

import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { EXTRA_OUTPUT_LOCATIONS, projectBase } from './utils'
import { buildServices } from '@commoners/testing'

// PyInstaller must be directly on PATH (e.g. via `conda activate commoners-demo`)
const hasPyInstaller = (() => {
  try { execSync('pyinstaller --version', { stdio: 'ignore' }); return true }
  catch { return false }
})()

const pythonServices = ['basic-python', 'numpy']

describe('All services with sources can be built individually', async () => {
  const config = await loadConfigFromFile(projectBase)

  const serviceNames = Object.keys(config.services)

  for (const name of serviceNames) {
    const isPython = pythonServices.includes(name)
    const describeFn = isPython && !hasPyInstaller ? describe.skip : describe

    describeFn(`Check resolved service filepath for ${name}`, () => {
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

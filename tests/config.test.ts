import { expect, test, describe } from 'vitest'

import {
  loadConfigFromFile,
  resolveConfigPath,
} from '@commoners/solidarity'

import { resolve, isAbsolute } from 'node:path'

import { name } from '../examples/demo/commoners.config'
import { projectBase } from './utils'

describe('Custom project base is loaded', () => {
  test('Config is resolved', () => {
    const configPath = resolveConfigPath(projectBase)
    expect(configPath).toBe(resolve(projectBase, 'commoners.config.ts'))
  })

  test('Config is loaded', async () => {
    const config = await loadConfigFromFile(projectBase)
    expect(config.name).toBe(name)
  })

  test('import.meta.url resolves service paths to absolute paths', async () => {
    const config = await loadConfigFromFile(projectBase)
    // The demo config uses getDirname(import.meta.url) for root resolution.
    // Service src values built with join(root, ...) should be absolute paths,
    // proving import.meta.url is correctly rewritten during config bundling.
    const httpService = config.services?.http
    const src = typeof httpService === 'object' ? httpService.src : httpService
    expect(isAbsolute(src), `Service src should be absolute, got: ${src}`).toBe(true)
  })
})

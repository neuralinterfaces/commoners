import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import {
    loadConfigFromFile,
    resolveConfigPath,
} from '@commoners/solidarity'

import { resolve, join } from 'node:path'

import { execSync } from 'node:child_process'

import { name } from './demo/commoners.config'
import { projectBase, registerBuildTest, registerStartTest } from './utils'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import isOnGithubActions from './github'

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
    { 
      target: 'electron', 
      // publish: isOnGithubActions
    }
  )

  registerBuildTest('Mobile', { target: 'mobile' }, false)
})


// const VITE_TEMPLATES_DIR = join(projectBase, '.vite-templates')

// const viteTemplates = [
//   "vanilla", 
//   "vanilla-ts",
//   // "vue",
//   // "vue-ts",
//   // "react",
//   // "react-ts",
//   // "react-swc",
//   // "react-swc-ts",
//   // "preact",
//   // "preact-ts",
//   // "lit",
//   // "lit-ts",
//   // "svelte",
//   // "svelte-ts",
//   // "solid",
//   // "solid-ts",
//   // "qwik",
//   // "qwik-ts"
// ]

// const getViteCommand = (name, template) => `npx --yes create-vite@latest ${name} --template ${template}`

// describe('Vite Templates', () => {

//   beforeAll(() => {
//     mkdirSync(VITE_TEMPLATES_DIR, { recursive: true })
//   })

//   afterAll(() => {
//     rmSync(VITE_TEMPLATES_DIR, { recursive: true, force: true })
//   })

//   viteTemplates.forEach(template => {
//     test(`Create ${template} project`, async () => {
//       const name = `vite-${template}`
//       const command = getViteCommand(name, template)
//       execSync(`cd ${VITE_TEMPLATES_DIR} && ${command}`)
//       const root = resolve(VITE_TEMPLATES_DIR, name)
//       const config = await loadConfigFromFile(root)
//       expect(existsSync(config.root)).toBe(true)
//       rmSync(config.root, { recursive: true, force: true })
//     })
//   })
// })

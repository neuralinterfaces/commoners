// sum.test.js
import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import { launch, normalizeTarget } from '../index'

import { build, checkAssets, sharePort, startBrowserTest } from '../../testing'

import config from './demo/commoners.config'
import userPkg from './demo/package.json' assert { type: 'json'}
import { join } from 'node:path'

const randomNumber =  Math.random().toString(36).substring(7)
const scopedBuildOutDir = '.site'

export const projectBase = join(__dirname, 'demo')

const getServices = (registrationOutput) => ((registrationOutput.commoners ?? registrationOutput.manager) ?? {}).services


export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const e2eTests = {
    basic: (registrationOutput, { target }) => {

        const normalizedTarget = normalizeTarget(target)

        describe('Basic E2E Test', () => {
    
            test("Global variable is valid", async () => {

                const { commoners } = registrationOutput
                const { name, target, version, plugins, services, ready } = commoners
                expect(name).toBe(config.name);
                expect(version).toBe(userPkg.version);
                expect(target).toBe(normalizedTarget);
                expect('echo' in plugins).toBe(true);
                expect(services).instanceOf(Object)
                expect(ready).instanceOf(Object) // Really is promise. Is passed as an object

                // Services cleared on mobile and web (not remote...)
                if (normalizedTarget === 'desktop') {
                  expect('http' in services).toBe(true);
                  expect(typeof services.url).toBe('string'); // NOTE: Actually specify the URL later
                }

            });
          })
    }
}

export const registerStartTest = (name, { target = 'web' } = {}, enabled = true) => {
  
  const describeCommand = enabled ? describe : describe.skip
  describeCommand(name, () => {

    // start(projectBase, { target })
    const output = startBrowserTest({ target }, projectBase)

    test('All assets are generated', async () => {
      checkAssets(projectBase, undefined, { target })
    })

    runAllServiceTests(output)

    e2eTests.basic(output, { target })

  })
}

export const registerBuildTest = (name, { target = 'web'} = {}, enabled = true) => {
  const describeCommand = enabled ? describe : describe.skip
  describeCommand(name, () => {

    const opts = { target, outDir: scopedBuildOutDir }

    let triggerAssetsBuilt
    let assetsBuilt = new Promise(res => triggerAssetsBuilt = res)

    const skipPackageStep = target === 'electron' || target === 'mobile'

    // NOTE: Desktop and mobile builds are not fully built
    const describeFn = skipPackageStep ? describe.skip : describe

    build(projectBase, opts, {
      onBuildAssets: (assetDir) => {
        if (skipPackageStep) return null
        else triggerAssetsBuilt(assetDir)
      }
    })

    test('All assets are found', async () => {
      const baseDir = (await assetsBuilt) as string
      checkAssets(projectBase, baseDir, { build: true, target })
    })

    describeFn('Launched application tests', async () => {
      const output = startBrowserTest({  launch: opts })
      e2eTests.basic(output, { target })
    })

  })
}

const runAllServiceTests = (registrationOutput) => {
  serviceTests.echo('http', registrationOutput)
  serviceTests.echo('express', registrationOutput)
  // serviceTests.echo('python')
  // serviceTests.complex()
  // serviceTests.basic('python')
}

export const serviceTests = {

  // Ensure shared server allows you to locate your services correctly
  share: {
    basic: (registrationOutput) => {
      test(`Shared Server Test`, async () => {
        
        const liveServices = getServices(registrationOutput)

        const { commoners, services = {} } = await fetch(`http://0.0.0.0:${sharePort}`).then(res => res.json());

        if (commoners) {
            const ids = [ 'http' ]
            ids.forEach(id => {
              const url = new URL(liveServices[id].url)
              expect(parseInt(url.port)).toBe(services['http'])
            })
        }
      })
    }
  },

  // Ensure a basic echo test passes on the chosen service
  echo: (id, registrationOutput) => {
      test(`Service Echo Test (${id})`, async () => {

        await sleep(500)
        
        // Grab live services
        const services = getServices(registrationOutput)
        
        // Request an echo response
        const res = await fetch(new URL('echo', services[id].url), {
            method: "POST",
            body: JSON.stringify({ randomNumber })
        }).then(res => res.json())

        expect(res.randomNumber).toBe(randomNumber)
      })
    },

  // }
}

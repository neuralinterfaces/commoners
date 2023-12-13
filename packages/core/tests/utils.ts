// sum.test.js
import { expect, test, describe } from 'vitest'

import { normalizeTarget } from '../index'

import { build, checkAssets, sharePort, startBrowserTest } from '../../testing'

import config from './commoners.config'
import userPkg from './package.json' assert { type: 'json'}

const randomNumber =  Math.random().toString(36).substring(7)
const scopedBuildOutDir = '.site'

export const projectBase = __dirname

const getServices = (registrationOutput) => ((registrationOutput.commoners ?? registrationOutput.manager) ?? {}).services


export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const e2eTests = {
    basic: (registrationOutput, { target }, mode = 'dev') => {

        const normalizedTarget = normalizeTarget(target)
        
        describe('Basic E2E Test', () => {
    
            test("Global variable is valid", async () => {

                const { commoners = {} } = registrationOutput
                const { name, target, version, plugins, services, ready } = commoners
                expect(name).toBe(config.name);
                expect(version).toBe(userPkg.version);
                expect(target).toBe(normalizedTarget);
                expect('echo' in plugins).toBe(true);
                expect(services).instanceOf(Object)
                expect(ready).instanceOf(Object) // Resolved Promise

                if (normalizedTarget === 'desktop') {
                    expect(commoners.quit).instanceOf(Object)
                }

                const isDev = mode === 'dev'

                  Object.entries(config.services).forEach(([name, service]) => {

                    // Web / PWA / Mobile builds will have cleared services (that are not remote)
                    expect(name in services).toBe(isDev);

                    if (isDev) {
                      expect(typeof services[name].url).toBe('string');
                      if ('port' in service) expect(parseInt(new URL(services[name].url).port)).toBe(service.port)
                    }

                    if (normalizedTarget === 'desktop') {
                      expect(typeof services[name].filepath).toBe('string');
                      expect(services[name].status).toBe(true)
                      expect(services[name].onActivityDetected).instanceOf(Object) // Function
                      expect(services[name].onClosed).instanceOf(Object)  // Function
                    }
                  })

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

  const isElectron = target === 'electron'
  const isMobile = target === 'mobile'

  describeCommand(name, () => {

    const opts = { target, outDir: scopedBuildOutDir }

    let triggerAssetsBuilt
    let assetsBuilt = new Promise(res => triggerAssetsBuilt = res)

    const skipPackageStep = isElectron  || isMobile

    // NOTE: Desktop and mobile builds are not fully built
    const describeFn = skipPackageStep ? describe.skip : describe

    build(projectBase, opts, {
      onBuildAssets: (assetDir) => {
        triggerAssetsBuilt(assetDir)
        if (skipPackageStep) return null
      }
    })

    test('All assets are found', async () => {
      const baseDir = (await assetsBuilt) as string
      checkAssets(projectBase, baseDir, { build: true, target })
    })

    describeFn('Launched application tests', async () => {
      const output = startBrowserTest({  launch: opts })
      e2eTests.basic(output, { target }, 'local')
    })

  })
}

const runAllServiceTests = (registrationOutput) => {
  serviceTests.echo('http', registrationOutput)
  serviceTests.echo('express', registrationOutput)
  serviceTests.echo('manual', registrationOutput)
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
        const res = await fetch(new URL('echo', services[id].url), { method: "POST", body: JSON.stringify({ randomNumber }) }).then(res => res.json())
        expect(res.randomNumber).toBe(randomNumber)
      })
    },

  // }
}

import { expect, test, describe } from 'vitest'

import { normalizeTarget } from '../index'

import { build, checkAssets, scopedBuildOutDir, sharePort, startBrowserTest } from '../../testing'

import config from './demo/commoners.config'

import { join } from 'node:path'

const randomNumber =  Math.random().toString(36).substring(7)

export const projectBase = join(__dirname, 'demo')

const getServices = (registrationOutput) => (registrationOutput.commoners ? registrationOutput.commoners.SERVICES : registrationOutput.manager.services) ?? {}


export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const e2eTests = {
    basic: (registrationOutput, { target }, mode = 'dev') => {

        const normalizedTarget = normalizeTarget(target)
        
        describe('Basic E2E Test', () => {
    
            test("Global variables are valid", async () => {

                const userPkg = require(join(projectBase, 'package.json'))

                const { commoners = {} } = registrationOutput
                const { 
                  NAME, 
                  VERSION, 
                  PLUGINS, 
                  SERVICES, 
                  READY, 

                  DESKTOP,
                  MOBILE,
                  WEB,

                  DEV,
                  PROD

                } = commoners

                const isDesktop = normalizedTarget === 'desktop'
                const isDev = mode === 'dev' 

                expect(NAME).toBe(config.name);
                expect(VERSION).toBe(userPkg.version);

                expect(WEB).toBe(normalizedTarget === 'web');
                expect(MOBILE).toBe(normalizedTarget === 'mobile');

                expect(DEV).toBe(isDev);
                expect(PROD).toBe(!isDev);

                if (isDesktop) {
                  expect(DESKTOP).instanceOf(Object)
                  expect(DESKTOP.quit).instanceOf(Object)
                } 
                
                else expect(DESKTOP).toBe(false);

                expect('echo' in PLUGINS).toBe(true);
                expect(SERVICES).instanceOf(Object)
                expect(READY).instanceOf(Object) // Resolved Promise

                Object.entries(SERVICES).forEach(([name, service]) => {

                    // Web / PWA / Mobile builds will have cleared services (that are not remote)
                    expect(name in SERVICES).toBe(isDev);

                    if (isDev) {
                      expect(typeof SERVICES[name].url).toBe('string');
                      if ('port' in service) expect(parseInt(new URL(SERVICES[name].url).port)).toBe(service.port)
                    }

                    if (isDesktop) {
                      expect(typeof SERVICES[name].filepath).toBe('string');
                      expect(SERVICES[name].onActive).instanceOf(Object) // Function
                      expect(SERVICES[name].onClosed).instanceOf(Object)  // Function
                    }
              })

              // // Environment Variables
              // expect(import.meta.env.VITE_ENV_VARIABLE).toBe('test')



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

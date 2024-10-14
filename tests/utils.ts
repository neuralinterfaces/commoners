import { vi, expect, test, describe, beforeAll, afterAll } from 'vitest'

import { normalizeTarget } from '@commoners/solidarity'

import { build, open } from '@commoners/testing'
import { checkAssets } from './assets'


import config from './demo/commoners.config'

import { join } from 'node:path'

export const scopedBuildOutDir = join('.commoners', 'custom_output_dir')

const getRandomNumber = () => Math.random().toString(36).substring(7)

const getMinutes = (minutes) => minutes * 60 * 1000

export const projectBase = join(__dirname, 'demo')

const getServices = async (output) => {

  if (output.page) {
    const { SERVICES } = await output.page.evaluate(() => commoners.READY.then(() => commoners))
    return SERVICES ?? {}
  }

  return output.services
}


export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const spyOnAll = (output) => {
  output.toSpyOn.forEach(({ object, method }) => {  
    const mockExit = vi.spyOn(object, method).mockImplementation(() => {
      mockExit.mockRestore()
    });
  })
}

const e2eTests = {
    basic: (output, { target }, mode = 'dev') => {

        const normalizedTarget = normalizeTarget(target)
        
        const isDev = mode === 'dev' 

        describe('Basic E2E Test', () => {
    
            test("Global variables are valid", async () => {

                const userPkg = require(join(projectBase, 'package.json'))

                const COMMONERS = await output.page.evaluate(() => {
                  const { commoners } = globalThis
                  return commoners.READY.then(() => commoners)
                })
                
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

                } = COMMONERS
                console.log('COMMONERS', COMMONERS)

                const isDesktop = normalizedTarget === 'desktop'
                const hasPublishedServices = isDev || isDesktop

                expect(NAME).toBe(config.name);
                expect(VERSION).toBe(userPkg.version);

                expect(WEB).toBe(normalizedTarget === 'web');
                expect(MOBILE).toBe(normalizedTarget === 'mobile');

                expect(DEV).toBe(isDev);
                expect(PROD).toBe(!isDev);

                expect('echo' in PLUGINS).toBe(true); // Test echo
                expect('splash' in PLUGINS).toBe(true); // Test splash page
                expect('protocol' in PLUGINS).toBe(true); // Test custom protocol
                expect('__testing' in PLUGINS).toBe(true); // Test custom protocol

                expect(SERVICES).instanceOf(Object)
                expect(READY).instanceOf(Object) // Resolved Promise

                Object.entries(SERVICES).forEach(([name, service]) => {

                    // Web / PWA / Mobile builds will have cleared services (that are not remote)
                    expect(name in SERVICES).toBe(hasPublishedServices);

                    if (hasPublishedServices) {
                      expect(typeof service.url).toBe('string');
                      if ('port' in service) expect(parseInt(new URL(service.url).port)).toBe(service.port)
                    }
              })


              // Desktop-Related Tests
              if (isDesktop) {
                expect(DESKTOP).instanceOf(Object)
                expect("quit" in DESKTOP).toBe(true)

                Object.values(SERVICES).forEach(service => {
                    expect(typeof service.filepath).toBe('string');
                    expect("onActive" in service).toBe(true) // Function
                    expect("onClosed" in service).toBe(true)  // Function
                })
              } 
              
              else expect(DESKTOP).toBe(false);


              // // Environment Variables
              // expect(import.meta.env.VITE_ENV_VARIABLE).toBe('test')



            });
          })
    }
}

export const registerStartTest = (name, { target = 'web' } = {}, enabled = true) => {
  
  
  const describeCommand = enabled ? describe : describe.skip

  describeCommand(name, () => {

    const output = {}
    beforeAll(async () => {
      const _output = await open(projectBase, { target })
      spyOnAll(_output)
      Object.assign(output, _output)

    })

    afterAll(() => {
      output.cleanup()
    })

    test('All assets are generated', async () => checkAssets(projectBase, undefined, { target }))

    serviceTests.echo('http', output)
    serviceTests.echo('express', output)
    serviceTests.echo('manual', output)
    serviceTests.echo('python', output)
    serviceTests.echo('cpp', output)

    e2eTests.basic(output, { target })

  })
}

type PublishOption = boolean | string | Function
type BuildOptions = { target?: string, publish?: PublishOption }

export const registerBuildTest = (name, { target = 'web', publish = false }: BuildOptions = {}, enabled = true) => {
  const describeCommand = enabled ? describe : describe.skip

  const isElectron = target === 'electron'
  const isMobile = target === 'mobile'

  describeCommand(name, () => {

    let triggerAssetsBuilt
    const assetsBuilt = new Promise(res => triggerAssetsBuilt = res)

    const skipPackageStep = isMobile

    // NOTE: Desktop and mobile builds are not fully built
    const describeFn = skipPackageStep ? describe.skip : describe

    const buildWaitTime = (isElectron || isMobile) ? getMinutes(5) : undefined // Wait for five minutes (max) for Electron services to build

    // Define inputs
    const opts = { target, build: { outDir: scopedBuildOutDir } }

    const hooks = {
      onBuildAssets: (assetDir) => {
        triggerAssetsBuilt(assetDir)
        if (skipPackageStep) return null
      }
    }


    // Setup build for testing
    const output = {}


    beforeAll(async () => {

      // Set publish option if specified
      if (publish) {
        if (typeof publish === 'function') publish = await publish()
        Object.assign(opts.build, { publish })
      }

      const _output = await build( projectBase,  opts, hooks )
      Object.assign(output, _output)
    }, buildWaitTime)

    // Cleanup build outputs
    afterAll(() =>  output.cleanup([ 'build' ]))

    test('All build assets have been created', async () => {
      const baseDir = (await assetsBuilt) as string
      checkAssets(projectBase, baseDir, { build: true, target })
    })

    describeFn('Launched application tests', async () => {

      const output = {}
      beforeAll(async () => {
        const _output = await open(projectBase, opts, true)
        spyOnAll(_output)
        Object.assign(output, _output)
      })

      afterAll(() => output?.cleanup())

      e2eTests.basic(output, { target }, 'local')
    })

  })
}

export const serviceTests = {

  // Ensure a basic echo test passes on the chosen service
  echo: (id, output) => {
      test(`Service Echo Test (${id})`, async () => {

        await sleep(500)
        
        // Grab live services
        const services = await getServices(output)
        
        // Request an echo response
        const randomNumber = getRandomNumber()
        const res = await fetch(new URL('echo', services[id].url), { method: "POST", body: JSON.stringify({ randomNumber }) }).then(res => res.json())
        expect(res.randomNumber).toBe(randomNumber)
      })
    },

  // }
}

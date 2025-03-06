import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import { getNormalizedTarget } from '@commoners/solidarity'

import { build, open } from '@commoners/testing'
import { checkAssets } from './assets'


import config from './demo/commoners.config'

import { join } from 'node:path'
import { getLocalIP } from '../packages/core/assets/services/ip'

export const EXTRA_OUTPUT_LOCATIONS = [ "build" ]

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

const localIP = getLocalIP()

const e2eTests = {
    plugins: (output, { target }, isDev = true) => {

      describe("Plugin features are working as expected", () => {

        test("Will pass messages between contexts", async () => {

          const randomId = getRandomNumber()

          const echo = await output.page.evaluate((input) => {
            const { commoners } = globalThis
            return commoners.READY.then(({ checks }) => checks.echo(input))
          }, randomId)

          expect(echo).toEqual(randomId)
        })

        test("Correct env is accessed", async () => {

            const env = await output.page.evaluate(() => {
              const { commoners } = globalThis
              return commoners.READY.then(({ checks }) => checks.env)
            })

            expect(env.COMMONERS_ENV_FOR_ALL_MODES).exists()

            if (isDev) expect(env.COMMONERS_ONLY_DEV).exists()
            else expect(env.COMMONERS_ONLY_PROD).exists()
        })

        test("Source file is resolved", async () => {

          const src = await output.page.evaluate(() => {
            const { commoners } = globalThis
            return commoners.READY.then(({ checks }) => checks.src)
          })

          expect(src).toBeTypeOf("string")
          expect(src.endsWith("checks.ts")).toBe(true)
        })

      })

    },
    basic: (output, { target }, isDev = true) => {

        const normalizedTarget = getNormalizedTarget(target)
        
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

                  PAGES,
                  SERVICES, 
                  READY, 

                  DESKTOP,
                  MOBILE,
                  WEB,

                  DEV,
                  PROD,

                  ENV

                } = COMMONERS

                const isDesktop = normalizedTarget === 'desktop'
                const availableByDefault = isDev || isDesktop

                expect(NAME, "Name does not natch").toBe(config.name);
                expect(VERSION, "Version does not match").toBe(userPkg.version);

                expect(WEB, "Web flag does not match").toBe(normalizedTarget === 'web');
                expect(MOBILE, "Mobile flag does not match").toBe(normalizedTarget === 'mobile');

                expect(READY, "Ready promise is not the expected type").instanceOf(Object) // Resolved Promise

                // Existence Checks
                expect(PAGES, "Pages dictionary is not the expected type").instanceOf(Object)

                // Build Mode Changes
                expect(DEV, "Dev flag does not match").toBe(isDev ? `ws://${localIP}:${process.env['COMMONERS_WEBSOCKET_PORT']}` : false);
                expect(PROD, "Prod flag does not match").toBe(!isDev);

                expect(ENV.COMMONERS_ENV_FOR_ALL_MODES, "Commoners custom environment variable does not match").exists()

                // Plugin Checks
                expect('checks' in PLUGINS, "Checks plugin is not enabled").toBe(true); // Test checks existence
                expect('localServices' in PLUGINS, "Local services plugin is not enabled").toBe(isDev || isDesktop);

                // Service Checks
                expect(SERVICES, "Services dictionary is not the expected type").instanceOf(Object)

                Object.entries(SERVICES).forEach(([ name, service ]) => {

                    const shouldBePublished = availableByDefault || !!service.url

                    // Web / PWA / Mobile builds will have cleared services (that are not remote)
                    expect(name in SERVICES, `${name} is not published correctly`).toBe(shouldBePublished);

                    if (shouldBePublished) {
                      expect(typeof service.url).toBe('string');
                      if ('port' in service) expect(parseInt(new URL(service.url).port)).toBe(service.port)
                    }
              })


              // Desktop-Related Tests
              if (isDesktop) {

                // Desktop-specific plugins
                expect('protocol' in PLUGINS, "Protocol plugin is not enabled").toBe(true);

                // // NOTE: Only run on the backend. No loaded value to check on the frontend
                // expect('splash' in PLUGINS, "Splash plugin is not enabled").toBe(true); 
                // expect('__testing' in PLUGINS, "Testing plugin is not enabled").toBe(true);

                // Desktop controls
                expect(DESKTOP, "Desktop flag is not the expected type").instanceOf(Object)
                expect("quit" in DESKTOP, "Desktop flag does not have a quit function").toBe(true)
                expect("__id" in DESKTOP, "Desktop flag does not have an __id value").toBe(true)
                expect("__main" in DESKTOP, "Desktop flag does not have a __main flag").toBe(true)


                // Check desktop service controls
                const allWithClose = Object.values(SERVICES).filter(service => "close" in service)
                expect(allWithClose.length, "Each service does not have a close function").toBeGreaterThan(0)

                const allWithOnClosed = Object.values(SERVICES).filter(service => "onClosed" in service)
                expect(allWithOnClosed.length, "Each service does not have an onClosed function").toBeGreaterThan(0)

                const allWithStatus = Object.values(SERVICES).filter(service => "status" in service)
                expect(allWithStatus.length, "Each service does not have a status value").toBeGreaterThan(0)
              } 
              
              else expect(DESKTOP).toBe(false);

            });
          })
    }
}

export const getMockOutput = () => {
  return {
    cleanup: () => {}
  }
}

export const registerStartTest = (name, { target = 'web' } = {}, enabled = true) => {
  
  
  const describeCommand = enabled ? describe : describe.skip

  describeCommand(name, () => {

    const output = getMockOutput()
    beforeAll(async () => {
      const _output = await open(projectBase, { target })
      Object.assign(output, _output)

    })

    afterAll(() => output.cleanup())

    test('All assets are generated', async () => checkAssets(projectBase, undefined, { target }))

    const echoServices = [
      'http', 
      'express', 
      // 'manual', 
      'manualAutobuild',
      // 'manualCustomLocation',
      'basic-python', 
      'numpy', 
      'cpp',
      'dynamicNode',
    ]

    // const services = [ 
    //   ...echoServices,
    //   'remote',
    //   // 'publishedToRemoteLocation',
    //   // 'localForDesktop',
    //   // 'remoteOnDesktop_removedOtherwise',
    //   // 'removedOnDesktop'
    // ] 


    echoServices.forEach(name => serviceTests.echo(name, output))
    
    e2eTests.basic(output, { target })
    e2eTests.plugins(output, { target })

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
    const opts = { target, outDir: scopedBuildOutDir, build: {} }

    const hooks = {
      onBuildAssets: (assetDir) => {
        triggerAssetsBuilt(assetDir)
        if (skipPackageStep) return null
      }
    }


    // Setup build for testing
    const output = getMockOutput()

    beforeAll(async () => {

      // Set publish option if specified
      if (publish) {
        if (typeof publish === 'function') publish = await publish()
        Object.assign(opts.build, { publish })
      }

      const _output = await build( projectBase, opts, hooks )
      Object.assign(output, _output)
    }, buildWaitTime)

    // Cleanup build outputs
    afterAll(() =>  output.cleanup(EXTRA_OUTPUT_LOCATIONS))

    test('All build assets have been created', async () => {
      const baseDir = (await assetsBuilt) as string
      checkAssets(projectBase, baseDir, { build: true, target })
    })

    describeFn('Launched application tests', async () => {

      const output = getMockOutput()
      beforeAll(async () => {
        const _output = await open(projectBase, opts, true)
        Object.assign(output, _output)
      })

      afterAll(() => output.cleanup())

      e2eTests.basic(output, { target }, false)
      e2eTests.plugins(output, { target }, false)

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

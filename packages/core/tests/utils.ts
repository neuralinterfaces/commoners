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


export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const e2eTests = {
    basic: (registrationOutput, { target }) => {

        const normalizedTarget = normalizeTarget(target)

        describe('Basic E2E Test', () => {
    
            test("Global variable is valid", async () => {

                const { page } = registrationOutput
                const { name, target, version, plugins, services, ready } = await page.evaluate(() => commoners.ready.then(() => commoners));
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

    runAllServiceTests()

    e2eTests.basic(output, { target })

  })
}

export const registerBuildTest = (name, { target = 'web'} = {}, enabled = true) => {
  const describeCommand = enabled ? describe : describe.skip
  describeCommand(name, () => {

    const opts = { target, outDir: scopedBuildOutDir }

    build(projectBase, opts)

    test('All assets are found', () => {
      checkAssets(projectBase, opts.outDir, { build: true, target })
    })

    describe('Launched application tests', async () => {
      const output = startBrowserTest({  launch: opts })
      e2eTests.basic(output, { target })
    })

  })
}

const runAllServiceTests = () => {
  serviceTests.basic('http')
  // serviceTests.complex()
  // serviceTests.basic('python')
}

export const serviceTests = {

  // Ensure shared server allows you to locate your services correctly
  share: {
    basic: () => {
      test(`Shared Server Test`, async () => {
    
        const { commoners, services = {} } = await fetch(`http://0.0.0.0:${sharePort}`).then(res => res.json());
        if (commoners) {
            const ids = [ 'http' ]
            ids.forEach(id => {
              expect(config.services[id].port).toBe(services['http'])
            })
        }
      })
    }
  },

  // Ensure a basic echo test passes on the chosen service
  basic: (id) => {
      test(`Basic Service Test (${id})`, async () => {

        await sleep(100)
        
        const res = await fetch(`http://localhost:${config.services[id].port}`, {
            method: "POST",
            body: JSON.stringify({ randomNumber })
        }).then(res => res.json())

        expect(res.randomNumber).toBe(randomNumber)
      })
    },

    // // Ensure a complicated WebSocket server with node_module dependencies will pass a basic echo test
    // complex: () => {
      // test('Complex Node Service Test', async () => {
        //   if (ws) {
        //       const wsService = new URL(ws.url)
    
        //       const socket = new WebSocket(`ws://localhost:${config.services.ws.port}`)
    
        //       socket.onmessage = (o) => {
        //           console.log('WS Echo Confirmed', JSON.parse(o.data).payload.number === test)
        //       }
    
        //       let send = (o: any) => socket.send(JSON.stringify(o))
    
        //       socket.onopen = () => send({ number: test })
        //   }
        // })
    // }


  // }
}

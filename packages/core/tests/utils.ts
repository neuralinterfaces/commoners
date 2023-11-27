// sum.test.js
import { expect, test, describe } from 'vitest'

import { launch } from '../index'

import { build, start, checkAssets, sharePort } from '../../testing'

import config from './demo/commoners.config'
import { join } from 'node:path'

const randomNumber =  Math.random().toString(36).substring(7)
const scopedBuildOutDir = '.site'

export const projectBase = join(__dirname, 'demo')


export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const registerStartTest = (name, { target = 'web', skip = false } = {}) => {
  
  const describeCommand = skip ? describe.skip : describe
  describeCommand(name, () => {

    start(projectBase)
      
    test('All assets are generated', async () => {
      checkAssets(projectBase, undefined, { target })
    })

    runAllServiceTests()

  })
}

export const registerBuildTest = (name, { target = 'web', skip = false } = {}) => {
  const describeCommand = skip ? describe.skip : describe
  describeCommand(name, () => {

    const opts = { target, outDir: scopedBuildOutDir }

    build(projectBase, opts)

    test('All assets are found', () => {
      checkAssets(projectBase, opts.outDir, { build: true, target })
    })

    launchTests.basic(opts)

  })
}

export const launchTests = {
  basic: ({ target, outDir }) => {
    test('Can be launched (basic)', async () => {
      const result = await launch({ target, outDir })
      const res = await fetch(result.url as string)
      const text = await res.text()
      text.includes('Hello World')
      expect(text.includes('Hello World!')).toBe(true)
      expect(res.status).toBe(200)
    })
  }
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

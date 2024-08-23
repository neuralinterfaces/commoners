
import {
  build,
  loadConfigFromFile,
  start,
  share,
  globalWorkspacePath,
  electronDebugPort,
  launch,
  UserConfig,
  CommonersGlobalObject,
} from '@commoners/solidarity'

import { join } from 'node:path'
import { rmSync, existsSync } from 'node:fs'

import * as puppeteer from 'puppeteer'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

type Output = {
  cleanup: Function
}

export const beforeStart = async (projectBase, customProps) => {

  const config = await loadConfigFromFile(projectBase)

  const result = await start({
    ...config,
    ...customProps
  })

  return {
    url: result.url,
    cleanup: result.close
  }
}


// const waitTime = (isElectron || isMobile) ? 1 * 60 * 1000 : undefined // Wait a minute for Electron services to build

// NOTE: You'll likely have to wait longer for Electron to build
export const beforeBuild = async (projectBase, { target, outDir }, hooks = {}) => {

  const toClear = [
    outDir,
    join(projectBase, globalWorkspacePath), // Includes services and temporary files
  ]

  const config = await loadConfigFromFile(projectBase)

  const updatedConfig = { ...config, build: { outDir, ...config.build }, target }

  await build(updatedConfig, hooks)

  return {
    cleanup: async (relativePathsToRemove = []) => {
      
      const toRemove = [...toClear, ...relativePathsToRemove.map(path => join(projectBase, path))]

      toRemove.forEach(path => {
        if (existsSync(path)) rmSync(path, { recursive: true })
      })
    }
  }
}

type BrowserTestOutput = {
  page?: puppeteer.Page,
  browser?: puppeteer.Browser,
  commoners?: CommonersGlobalObject,
  toSpyOn?: { object: any, method: string }[],

  url: string,
  server?: any,
} & Output

export const beforeAppControl = async (customProps: Partial<UserConfig> = {}, projectBase?: string, useBuild = false) => {

  const { target } = customProps // NOTE: Should derive

  const isElectron = target === 'electron'

  const states: Partial<BrowserTestOutput> = {}

  const result = await (useBuild ? launch(customProps) : beforeStart(projectBase, customProps))

  // if (toLaunch) await sleep(500) // Ensure server finishes opening

  const browser = states.browser = await puppeteer.launch()
  // const browser = output.browser = await puppeteer.launch({ headless: false })

  const page = states.page = await browser.newPage();

  // Launched Electron Instance
  if (isElectron) {

    await sleep(5 * 1000) // Wait for five seconds for Electron to open

    const browserURL = `http://localhost:${electronDebugPort}`
    await page.goto(browserURL);
    const endpoint = await page.evaluate(() => fetch(`json/version`).then(res => res.json()).then(res => res.webSocketDebuggerUrl))
    await browser.close()

    // Connect to browser WS Endpoint
    const browserWSEndpoint = endpoint.replace('localhost', '0.0.0.0')
    states.browser = await puppeteer.connect({ browserWSEndpoint, defaultViewport: null })
    const pages = await states.browser.pages()
    states.page = pages[0]
  }

  // Non-Electron Instance
  else await page.goto(result.url);

  const output = {
    cleanup: () => {},
    ...states,
    toSpyOn: [
      { object: process, method: 'exit' } // Ensure Electron will exit gracefully
    ]
  } as BrowserTestOutput

  return output


  // output.toSpyOn.forEach(({ object, method }) => {  
  //   const mockExit = vi.spyOn(object, method).mockImplementation(() => {
  //     mockExit.mockRestore()
  //   });
  // })
}

export const afterAppControl = async (output: BrowserTestOutput) => {

  if (output.browser) await output.browser.close() // Will also exit the Electron instance

  // Start successful
  if (output.info) {
    if (output.info.server) output.info.server.close()

    output.cleanup({
      services: true,
      frontend: true
    })
  }

}

type ShareOptions = {
  port: number,
  [key: string]: any
}

export const beforeShare = async (projectBase, additionalProps: ShareOptions) => {
  const config = await loadConfigFromFile(projectBase)
  config.share = { ...(config.share ?? {}), ...additionalProps } // Specify share port
  const result = await share(config)

  return {
    services: result.services,
    port: result.port,
    cleanup: result.close
  }
}

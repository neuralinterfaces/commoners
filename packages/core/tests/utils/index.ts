
import { afterAll, beforeAll } from 'vitest'
import {
    build,
    loadConfigFromFile,
    start,
  } from '../../index.js'

import { join } from 'node:path'
import { rmSync } from 'node:fs'
  

const startProject = (projectBase, customProps = {}) => {

    let manager;
    beforeAll(async () => {
        const config = await loadConfigFromFile(projectBase)
        manager = await start({
        ...config,
        ...customProps
        })
    })

    afterAll(() => {
        manager.close({
            services: true,
            frontend: true
        })
    })

  }


  const buildProject = async (projectBase, { target, outDir }) => {
    beforeAll(async () => {
        const config = await loadConfigFromFile(projectBase)
        await build({
          ...config,
          target,
          build: {
            outDir: join('..', outDir) // Escape from the project base
          }
        })
      })
  
      afterAll(async () => {
        rmSync(outDir, { recursive: true })
      })
}  
  

export {
    startProject as start,
    buildProject as build
}
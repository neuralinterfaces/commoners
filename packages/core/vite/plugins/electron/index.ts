import { join, resolve } from 'node:path'
import { vite } from '../../../globals.js'
import { rootDir } from '../../../globals.js'

import { withExternalBuiltins } from './inbuilt.js'
import { resolveServerUrl } from './server.js'
import { electronGlobalStates, startup } from './electron.js'  

type UserConfig = import('vite').UserConfig
type ConfigEnv = import('vite').ConfigEnv
type Plugin = import('vite').Plugin
type InlineConfig = import('vite').InlineConfig

const assignFromConfigEnv = [ 'mode' ]
const assignFromUserConfig = [ 'root', 'envDir', 'envPrefix' ]

const pluginName = '@commoners/electron'

interface ElectronOptions {
  entry: string
  vite?: import('vite').InlineConfig
  onstart?: (args: {
    startup: () => Promise<void>
    reload: () => void
  }) => void | Promise<void>
}

async function resolveViteConfig(options: ElectronOptions): Promise<InlineConfig> {

    const { mergeConfig } = await vite

    const defaultConfig: InlineConfig = {
      logLevel: 'silent',

      configFile: false,
      publicDir: false,
  
      build: { 
        lib: {
            entry: options.entry,
            formats: [ 'cjs' ],
            fileName: () => '[name].cjs',
        },
        emptyOutDir: false 
      },
      resolve: {
        // @ts-ignore
        browserField: false,
        conditions: ['node'],
        mainFields: ['module', 'jsnext:main', 'jsnext'],
      },
      define: { 'process.env': 'process.env' }, // Maintain process.env
    }
  
    return mergeConfig(defaultConfig, options?.vite || {})
  }


export const buildWithVite = async (options: ElectronOptions) => {
    const _vite = await vite
    const resolvedConfig = await resolveViteConfig(options)
    return _vite.build(withExternalBuiltins(resolvedConfig))
}

const getElectronBuildOptions = async ( root: string, outDir: string, build: boolean = false ) => {

    const _vite = await vite

    const electronTemplateBase = join(rootDir, 'assets', 'electron')
    const mainLocation = join(electronTemplateBase, 'main.ts')
    const preloadLocation = join(electronTemplateBase, 'preload.ts')

    outDir = resolve(outDir) // Resolve the outDir to an absolute path

    const sharedBuildConfig = { minify: build, outDir }

    const main: ElectronOptions = {
        entry: mainLocation,
        onstart: (options) => options.startup(),              
        vite: _vite.defineConfig({ root, build: sharedBuildConfig })
    }

    const preload: ElectronOptions = {
        entry: preloadLocation,
        onstart: (args) => args.reload(), // Reload the page when the Preload-Scripts build is complete
        vite: _vite.defineConfig({
          root,
          build: {...sharedBuildConfig, rollupOptions: { output: { inlineDynamicImports: true } } }
        }),
    }
    
    return [ main, preload ]
}

export const buildElectronAssets = async ( 
  root: string, 
  outDir: string, 
  build: boolean = false,
  configEnv: ConfigEnv,
  userConfig: UserConfig = {}
) => {
    const optionsArray = await getElectronBuildOptions(root, outDir, build)
    for (const options of optionsArray) {
      assignFromConfigEnv.forEach((key) => options.vite[key] ??= configEnv[key])
      assignFromUserConfig.forEach((key) => options.vite[key] ??= userConfig[key])
      await buildWithVite(options)
    }
}


export const startElectronInstance = (root) => startup(root)
  
export default async function commonersElectronPlugin({ build, root, outDir, electron }: { build: boolean, root: string, outDir: string, electron: any  }): Promise<Plugin[]> {

    let userConfig: UserConfig
    let configEnv: ConfigEnv
  
    // NOTE: Serve behaviors removed for use as modules
    return [
      {
        name: pluginName,
        apply: 'serve',
        configureServer(server) {

          const { dev } = electron || {}
          const { load } = dev || {}
          if (load === 'file') return // Do not host files in dev mode

          server.httpServer?.once('listening', async () => {
            Object.assign(process.env, { VITE_DEV_SERVER_URL: resolveServerUrl(server) }) // Used in main.ts
  
            const optionsArray = await getElectronBuildOptions(root, outDir, build)
            const entryCount = optionsArray.length
            let closeBundleCount = 0
  
            for (const options of optionsArray) {
              
              const assignToConfig = (key) => options.vite[key] ??= server.config[key]
              assignFromConfigEnv.forEach(assignToConfig)
              assignFromUserConfig.forEach(assignToConfig)

              const buildOptions = options.vite.build
              buildOptions.watch ??= {}
              buildOptions.minify ??= false

              options.vite.plugins = [
                {
                  name: ':startup',
                  closeBundle() {
                    if (++closeBundleCount < entryCount) return
  
                    if (options.onstart) {
                      options.onstart.call(this, {
                        startup: () => startElectronInstance(root),
                        reload() {
                          if (electronGlobalStates.app) server.ws.send({ type: 'full-reload' })
                          else startElectronInstance(root)
                        },
                      })
                    } else startElectronInstance(root)
                  },
                },
              ]

              buildWithVite(options)
            }
          })
        },
      },
      {
        name: pluginName,
        apply: 'build',
        config(config, env) {
          userConfig = config
          configEnv = env  
          config.base ??= './'
        },
        async closeBundle() {
          await buildElectronAssets(root, outDir, build, configEnv, userConfig)
        }
      },
    ]
  }
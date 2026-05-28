import { Service } from './types.js'
import type { ExtensionCapabilities } from '../types.js'

export type WasmCargoServiceProperties = Service & {
  bin?: string // Cargo binary name (defaults to service name)
  cargoArgs?: string
  profile?: string
  target?: string // wasm-pack target: 'bundler' | 'web' | 'nodejs' | 'no-modules'
}

export class WasmCargoService {
  src: string
  build: any
  publish: Service['publish']
  capabilities: ExtensionCapabilities
  __wasm: true // Marker for WASM services

  constructor(service: WasmCargoServiceProperties, outDir: string = `./build`) {
    const out = `${outDir}/_${service.name}`

    const { name, src, publish, cargoArgs = '', profile = 'release', target = 'bundler' } = service

    this.src = src
    this.__wasm = true

    this.capabilities = {
      runtime: 'wasm',
      platforms: { web: true },
      ...service.capabilities,
    }

    const build = async ({ src: srcPath, out: outPath }) => {
      const { dirname, resolve } = await import('node:path')
      const { mkdirSync } = await import('node:fs')
      mkdirSync(dirname(outPath), { recursive: true })

      // Walk up from src to find Cargo.toml (project root)
      const projectDir = resolve(dirname(srcPath), '..')

      // wasm-pack build outputs to pkg/ by default, but we redirect to outPath
      return `cd "${projectDir}" && wasm-pack build --target ${target} --${profile} --out-dir "${resolve(outPath)}" ${cargoArgs}`
    }

    this.build = build

    this.publish = publish ?? {
      src: name,
      base: out,
      build,
    }

    Object.entries(service).forEach(([key, value]) => {
      if (!(key in this)) this[key] = value
    })
  }
}

export const createWasmCargoServices = (
  services: WasmCargoServiceProperties[],
  outDir?: string
) => {
  return services.reduce((acc, service) => {
    acc[service.name] = new WasmCargoService(service, outDir)
    return acc
  }, {})
}

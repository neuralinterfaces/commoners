import { Service } from './types.js'
import type { ExtensionCapabilities } from '../types.js'

export type CargoServiceProperties = Service & {
  bin?: string      // Cargo binary name (defaults to service name)
  cargoArgs?: string
  profile?: string
}

export class CargoService {
  src: string
  build: any
  publish: Service['publish']
  capabilities: ExtensionCapabilities

  constructor(
    service: CargoServiceProperties,
    outDir: string = `./build`
  ) {
    const out = `${outDir}/_${service.name}`

    const { name, src, publish, bin = name, cargoArgs = '', profile = 'release' } = service

    this.src = src

    this.capabilities = {
      runtime: 'process',
      platforms: { desktop: true },
      ...service.capabilities,
    }

    const build = async ({ src: srcPath, out: outPath }) => {
      const { dirname, resolve } = await import('node:path')
      const os = await import('node:os')
      const { mkdirSync } = await import('node:fs')
      mkdirSync(dirname(outPath), { recursive: true })

      // Walk up from src to find Cargo.toml (project root)
      const projectDir = resolve(dirname(srcPath), '..')
      const isWindows = os.platform() === 'win32'
      const binaryName = isWindows ? `${bin}.exe` : bin
      const cp = isWindows ? 'copy' : 'cp'

      return `cd "${projectDir}" && cargo build --profile ${profile} ${cargoArgs} && ${cp} "target/${profile}/${binaryName}" "${resolve(outPath)}"`
    }

    // Top-level build for dev mode (Rust always needs compilation, unlike Python)
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

export const createCargoServices = (services: CargoServiceProperties[], outDir?: string) => {
  return services.reduce((acc, service) => {
    acc[service.name] = new CargoService(service, outDir)
    return acc
  }, {})
}

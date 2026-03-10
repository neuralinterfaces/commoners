import { Service } from './types.js'
import type { ExtensionCapabilities } from '../types.js'

export type CargoServiceProperties = Service & {
  bin?: string      // Cargo binary name (defaults to service name)
  cargoArgs?: string
  profile?: string
}

// Cargo maps the 'dev' profile to the 'debug' output directory
const getCargoOutputDir = (profile: string) => profile === 'dev' ? 'debug' : profile

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

    const { name, src, publish, bin = name, cargoArgs = '', profile = 'dev' } = service

    this.src = src

    this.capabilities = {
      runtime: 'process',
      platforms: { desktop: true },
      ...service.capabilities,
    }

    const makeBuildCommand = (buildProfile: string) => async ({ src: srcPath, out: outPath }) => {
      const { dirname, resolve } = await import('node:path')
      const os = await import('node:os')
      const { mkdirSync } = await import('node:fs')
      mkdirSync(dirname(outPath), { recursive: true })

      // Walk up from src to find Cargo.toml (project root)
      const projectDir = resolve(dirname(srcPath), '..')
      const isWindows = os.platform() === 'win32'
      const binaryName = isWindows ? `${bin}.exe` : bin
      const outputDir = getCargoOutputDir(buildProfile)
      // On macOS/Linux, remove the old binary before copying to ensure a new inode.
      // Overwriting in place (same inode) while zombie processes hold the old inode
      // causes Apple Silicon code page cache issues that make new executions fail.
      const cpCmd = isWindows ? `copy "target\\${outputDir}\\${binaryName}" "${resolve(outPath)}"` : `rm -f "${resolve(outPath)}" && cp "target/${outputDir}/${binaryName}" "${resolve(outPath)}"`

      return `cd "${projectDir}" && cargo build --profile ${buildProfile} ${cargoArgs} && ${cpCmd}`
    }

    // Top-level build for dev mode (Rust always needs compilation, unlike Python)
    this.build = makeBuildCommand(profile)

    // Publish always uses release profile for production builds
    const publishBuild = makeBuildCommand('release')
    this.publish = publish ?? {
      src: name,
      base: out,
      build: publishBuild,
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

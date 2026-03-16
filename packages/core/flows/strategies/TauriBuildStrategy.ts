/**
 * Tauri-specific build strategy
 * Generates a src-tauri/ project and invokes `tauri build`
 */

import { join, dirname, isAbsolute, extname } from 'node:path'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  cpSync,
} from 'node:fs'
import { execSync } from 'node:child_process'
import { deflateSync, crc32 } from 'node:zlib'
import { createLogger } from '../../assets/utils/logger.js'
import { BaseBuildStrategy, type BuildContext } from '../BuildFlow.js'
import { TARGET_DESKTOP_TAURI, DIR_TAURI } from '../../constants.js'
import { globalTempDir } from '../../globals.js'
import { DependencyError, BuildError } from '../../errors.js'
import { getIcon } from '../../assets/utils/icons.js'
import { createSEA, isSEASupported } from '../../utils/sea.js'
import {
  generateCargoToml,
  generateMainRs,
  generateTauriConf,
  generateCapabilities,
  type SidecarEntry,
} from './tauri-templates.js'

const logger = createLogger('TauriBuildStrategy')

/**
 * Convert a PNG buffer to ICO format (single entry, embedded PNG).
 * ICO format: 6-byte header + 16-byte directory entry + PNG data.
 */
function pngToIco(pngData: Buffer): Buffer {
  const size = pngData.length
  // Parse PNG dimensions from IHDR chunk (offset 16-23)
  const width = pngData.readUInt32BE(16)
  const height = pngData.readUInt32BE(20)

  // ICO header (6 bytes)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type: 1 = ICO
  header.writeUInt16LE(1, 4) // Count: 1 image

  // Directory entry (16 bytes)
  const dir = Buffer.alloc(16)
  dir.writeUInt8(width >= 256 ? 0 : width, 0) // Width (0 = 256)
  dir.writeUInt8(height >= 256 ? 0 : height, 1) // Height (0 = 256)
  dir.writeUInt8(0, 2) // Color palette
  dir.writeUInt8(0, 3) // Reserved
  dir.writeUInt16LE(1, 4) // Color planes
  dir.writeUInt16LE(32, 6) // Bits per pixel
  dir.writeUInt32LE(size, 8) // Image data size
  dir.writeUInt32LE(22, 12) // Offset to image data (6 + 16)

  return Buffer.concat([header, dir, pngData])
}

/**
 * Create a minimal 1x1 RGBA PNG for use as a placeholder icon.
 * This is a valid PNG that Tauri's icon decoder will accept.
 */
function createMinimalRgbaPng(): Buffer {
  // 1x1 RGBA pixel (transparent)
  const raw = Buffer.from([0, 0, 0, 0, 0]) // filter byte + RGBA
  const compressed = deflateSync(raw)

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeAndData = Buffer.concat([Buffer.from(type), data])
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(typeAndData) >>> 0)
    return Buffer.concat([len, typeAndData, crcBuf])
  }

  // IHDR: 1x1, 8-bit RGBA
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0) // width
  ihdr.writeUInt32BE(1, 4) // height
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // color type: RGBA
  ihdr.writeUInt8(0, 10) // compression
  ihdr.writeUInt8(0, 11) // filter
  ihdr.writeUInt8(0, 12) // interlace

  const iend = Buffer.alloc(0)

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend),
  ])
}

/**
 * Detect the Rust host triple (e.g. x86_64-apple-darwin, aarch64-apple-darwin)
 */
export function detectHostTriple(): string {
  const versionInfo = execSync('rustc -vV', { encoding: 'utf-8' })
  const hostLine = versionInfo.split('\n').find(l => l.startsWith('host:'))
  return hostLine ? hostLine.split(':')[1].trim() : ''
}

/**
 * Tauri build strategy implementation
 */
export class TauriBuildStrategy extends BaseBuildStrategy {
  readonly platform = 'tauri'
  private hostTriple = ''

  canHandle(target: string): boolean {
    return target === TARGET_DESKTOP_TAURI
  }

  protected shouldUseTempDir(): boolean {
    return true
  }

  protected getTempDir(root: string): string {
    return join(root, globalTempDir, DIR_TAURI, 'dist')
  }

  async prepare(context: BuildContext): Promise<void> {
    await super.prepare(context)

    // Verify Rust toolchain
    try {
      execSync('rustc --version', { stdio: 'pipe' })
    } catch {
      throw new DependencyError(
        'Rust toolchain not found',
        'Install Rust via https://rustup.rs/ and ensure rustc and cargo are on PATH.'
      )
    }

    // Verify @tauri-apps/cli
    try {
      execSync('npx tauri --version', { stdio: 'pipe', timeout: 30000 })
    } catch {
      throw new DependencyError(
        '@tauri-apps/cli not found',
        'Install the Tauri CLI: npm install -D @tauri-apps/cli'
      )
    }

    // Detect host triple
    try {
      this.hostTriple = detectHostTriple()
    } catch {
      this.hostTriple = ''
    }

    if (!this.hostTriple) {
      throw new BuildError(
        'Could not detect Rust host triple',
        'Run `rustc -vV` to verify your Rust installation.'
      )
    }

    // Check SEA support if any JS services exist
    const jsExts = ['.js', '.cjs', '.mjs']
    const hasJsServices = Object.values(context.config.serviceManifest).some(
      e => e.filepath && jsExts.includes(extname(e.filepath))
    )
    if (hasJsServices && !isSEASupported()) {
      throw new DependencyError(
        'Node.js SEA not supported',
        'Tauri cannot fork() Node.js processes. JS services must be compiled to Single Executable Applications (SEA), which requires Node.js >= 20.'
      )
    }

    logger.info('Tauri build environment prepared', { hostTriple: this.hostTriple })
  }

  async build(context: BuildContext): Promise<void> {
    const { config, outDir, stagingDir } = context
    const { name, appId, version } = config
    const tauriConfig = (config as any).tauri || {}

    logger.info('Starting Tauri packaging', { name, appId })
    context.hooks.emit({ type: 'build:tauri:start' } as any)

    // stagingDir is the Vite output dir (e.g. .commoners/.tmp/tauri/dist/)
    // src-tauri/ goes in the parent so it's not inside frontendDist
    const tauriRoot = dirname(stagingDir)
    const srcTauriDir = join(tauriRoot, 'src-tauri')
    const srcDir = join(srcTauriDir, 'src')
    const binDir = join(srcTauriDir, 'binaries')
    const capDir = join(srcTauriDir, 'capabilities')

    // Create directory structure
    for (const dir of [srcDir, binDir, capDir]) {
      mkdirSync(dir, { recursive: true })
    }

    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

    // Generate Cargo.toml
    writeFileSync(join(srcTauriDir, 'Cargo.toml'), generateCargoToml(sanitizedName))

    // Generate build.rs
    writeFileSync(join(srcTauriDir, 'build.rs'), 'fn main() {\n  tauri_build::build()\n}\n')

    // Copy compiled service binaries to src-tauri/binaries/ using service manifest
    const { serviceManifest } = config
    const externalBins: string[] = []
    const serviceIds: string[] = []
    const sidecarEntries: SidecarEntry[] = []

    const jsExts = ['.js', '.cjs', '.mjs']

    for (const [id, entry] of Object.entries(serviceManifest)) {
      if (entry.wasm || !entry.filepath || !existsSync(entry.filepath)) continue

      const ext = process.platform === 'win32' ? '.exe' : ''
      const targetName = `${id}-${this.hostTriple}${ext}`
      const destPath = join(binDir, targetName)

      // JS services must be compiled to SEA executables (Tauri can't fork Node.js)
      if (jsExts.includes(extname(entry.filepath))) {
        logger.info(`Compiling JS service "${id}" to SEA executable...`)
        const result = await createSEA({ src: entry.filepath, out: destPath, sign: true })
        if (!result.success) {
          throw new BuildError(
            `SEA compilation failed for service "${id}"`,
            result.error || 'Unknown error during Single Executable Application creation.'
          )
        }
        logger.info(`SEA compiled: ${targetName} (${(result.size! / 1024 / 1024).toFixed(1)} MB)`)
      } else {
        copyFileSync(entry.filepath, destPath)
      }

      // Ensure executable permission on macOS/Linux
      if (process.platform !== 'win32') {
        chmodSync(destPath, 0o755)
      }

      // Pre-sign sidecar on macOS
      if (process.platform === 'darwin') {
        try {
          execSync(`codesign -f -s - "${destPath}"`, { stdio: 'pipe' })
          logger.debug(`Pre-signed sidecar: ${targetName}`)
        } catch (e) {
          logger.warn(`Failed to pre-sign sidecar ${targetName}: ${(e as Error).message}`)
        }
      }

      externalBins.push(`binaries/${id}`)
      serviceIds.push(id)
      sidecarEntries.push({ id, bin: `binaries/${id}` })
    }

    // Generate src/main.rs (with sidecar lifecycle if services exist)
    writeFileSync(join(srcDir, 'main.rs'), generateMainRs(sidecarEntries))

    // Generate icons using `tauri icon` (handles PNG→ICO/ICNS + all required sizes)
    const iconDir = join(srcTauriDir, 'icons')
    mkdirSync(iconDir, { recursive: true })
    let tauriIconPaths: string[] = []

    const rawIconSrc = getIcon(config.icon)
    if (rawIconSrc) {
      const resolvedIconPath = isAbsolute(rawIconSrc) ? rawIconSrc : join(config.root, rawIconSrc)
      if (existsSync(resolvedIconPath)) {
        try {
          // `tauri icon` generates all platform formats from a single source PNG
          execSync(`npx tauri icon "${resolvedIconPath}" --output "${iconDir}"`, {
            stdio: 'pipe',
            cwd: srcTauriDir,
            timeout: 60000,
          })
          if (existsSync(join(iconDir, 'icon.png'))) tauriIconPaths.push('icons/icon.png')
          if (existsSync(join(iconDir, 'icon.ico'))) tauriIconPaths.push('icons/icon.ico')
          logger.info('Generated Tauri icons via `tauri icon`')
        } catch (e) {
          // Fallback for when tauri icon fails (e.g., indexed PNG, missing deps)
          logger.warn(
            `\`tauri icon\` failed, using manual fallback: ${(e as Error).message?.slice(0, 80)}`
          )
          const pngData = readFileSync(resolvedIconPath)
          const colorType = pngData.length > 25 ? pngData[25] : -1
          const isRgba = colorType === 6 || colorType === 2
          const srcData = isRgba ? pngData : createMinimalRgbaPng()
          if (!isRgba) logger.warn('Icon is not RGBA PNG, using minimal placeholder')
          writeFileSync(join(iconDir, 'icon.png'), srcData)
          tauriIconPaths = ['icons/icon.png']
          if (process.platform === 'win32') {
            writeFileSync(join(iconDir, 'icon.ico'), pngToIco(srcData))
            tauriIconPaths.push('icons/icon.ico')
          }
        }
      }
    }

    // Ensure icon files exist even with no config (tauri-build requires icon.ico on Windows)
    if (tauriIconPaths.length === 0) {
      const minimalPng = createMinimalRgbaPng()
      writeFileSync(join(iconDir, 'icon.png'), minimalPng)
      tauriIconPaths = ['icons/icon.png']
      if (process.platform === 'win32') {
        writeFileSync(join(iconDir, 'icon.ico'), pngToIco(minimalPng))
        tauriIconPaths.push('icons/icon.ico')
      }
    }

    // Generate tauri.conf.json
    const tauriConf = generateTauriConf({
      name,
      appId,
      version,
      icon: tauriIconPaths,
      tauriConfig,
      electronWindow: config.electron?.window,
      externalBins,
    })
    writeFileSync(join(srcTauriDir, 'tauri.conf.json'), JSON.stringify(tauriConf, null, 2))

    // Generate capabilities/default.json
    const capabilities = generateCapabilities(serviceIds)
    writeFileSync(join(capDir, 'default.json'), JSON.stringify(capabilities, null, 2))

    // Invoke tauri build
    logger.info('Running tauri build...', { cwd: tauriRoot })
    try {
      execSync('npx tauri build', {
        cwd: tauriRoot,
        stdio: 'inherit',
        env: { ...process.env },
        timeout: 600000, // 10 minute timeout
      })
    } catch {
      throw new BuildError(
        'Tauri build failed',
        'The tauri build command failed. Check the output above for details.'
      )
    }

    // Copy bundle output to final outDir
    const bundleDir = join(srcTauriDir, 'target', 'release', 'bundle')
    if (existsSync(bundleDir)) {
      const actualOutDir = isAbsolute(outDir) ? outDir : join(process.cwd(), outDir)
      mkdirSync(actualOutDir, { recursive: true })
      cpSync(bundleDir, actualOutDir, { recursive: true })
      logger.info('Tauri bundles copied to output', { outDir: actualOutDir })
    }

    context.hooks.emit({ type: 'build:tauri:complete' } as any)
    logger.info('Tauri packaging completed')
  }
}

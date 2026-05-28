import {
  build,
  buildServices,
  launch,
  launchServices,
  shareServices,
  resolveServiceConfiguration,
  start,
  loadConfigFromFile,

  // Types
  resolveHooks,
  UserConfig,
  valid,

  // Errors
  CommonersError,

  // Logger
  setGlobalLogLevel,
  setGlobalUI,
  LogLevel,
  isDesktop

} from '@commoners/solidarity'

import pkg from './package.json' assert { type: 'json' }

import { DefaultHooks, CommonersUI } from '@commoners/solidarity/ui'

// Parse early to check for --no-color flag
const hasNoColor = process.argv.includes('--no-color')

const ui = new CommonersUI({}, { noColor: hasNoColor })
setGlobalUI(ui) // Ensure loggers use the same system for formatting
const cliHooks = new DefaultHooks(ui)

// Utilities
import cac from 'cac'
import { join } from 'path'
import didYouMeanModule from 'didyoumean2'
const didYouMean = didYouMeanModule.default || didYouMeanModule // Handle both named and default exports

const reconcile = (userOpts = {}, cliOpts = {}, envOpts = {}) =>
  Object.assign({}, envOpts, userOpts, cliOpts) // CLI —> User —> Environment


class CLIError extends CommonersError {
  constructor(message: string, details?: string) {
    super(message, details)
    this.name = 'CLIError'
  }
}

const handleError = (error: Error) => {
  if (error instanceof CommonersError) {
    ui.error(error.message, error.details)
  } else {
    ui.error(error.message)
  }
  process.exit(1)
}

function preprocessTarget(target) {
  if (typeof target === 'string') {
    if (!valid.target.includes(target)) {

      // Suggest closest match for typos
      const suggestion = didYouMean(target, valid.target)



      if (suggestion) {
        const allTargetsWithoutSuggestion = valid.target.filter(t => t !== suggestion)
        throw new CLIError(
          `"${target}" is an invalid target`,
          `Did you mean ${ui._chalk.bold(suggestion)}? Other valid targets include ${renderCommaSeparatedList(allTargetsWithoutSuggestion)}`
        )
      }

      throw new CLIError(
        `"${target}" is an invalid target`,
        `Valid targets include ${renderCommaSeparatedList(valid.target)}`
      )
    }
  }
}

function resolveHooksForCLI(...args) {
  const hooks = resolveHooks(...args)
  if (!hooks.ui) hooks.ui = ui // Ensure UI is always available
  return hooks
}

type ConfigOpts = {
  root?: string
  config?: string
}

const getConfigPathFromOpts = ({ root, config }: ConfigOpts) =>
  root ? (config ? join(root, config) : root) : config

// Read configuration from STDIN
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error('No input provided via STDIN'))
      return
    }

    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => data += chunk)
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

// Load config from STDIN or file
async function getConfig(opts: { root?: string; config?: string; stdin?: boolean }) {
  if (opts.stdin) {
    try {
      const stdinData = await readStdin()
      const parsed = JSON.parse(stdinData)
      return parsed
    } catch (error) {
      handleError(new CLIError('Failed to parse configuration from STDIN', error.message))
    }
  }
  return loadConfigFromFile(getConfigPathFromOpts({ root: opts.root, config: opts.config }))
}

const cli = cac()

// Add global --no-color option
cli.option('--target <target>', 'Choose a target for the application')
cli.option('--config <path>', 'Specify a configuration file')
cli.option('--stdin', 'Read configuration from STDIN')
cli.option('--no-color', 'Disable colored output')
cli.option('-L, --log-level <level>', 'Set log level (debug, info, warn, error, silent)', { default: 'info' })

// Add example usage
cli.example('cat config.json | commoners build --stdin  # Use STDIN config')


function renderCommaSeparatedList(list: string[]) {
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return list.slice(0, -1).join(', ') + ' and ' + list.slice(-1)
}

// Initialize commoners in an existing project
cli
  .command('init [root]', 'Add Commoners to an existing project')

  .example('commoners init')
  .example('commoners init ./my-app')

  .action(async (root) => {
    const { existsSync, writeFileSync, readFileSync } = await import('node:fs')
    const { resolve, join } = await import('node:path')

    const projectRoot = resolve(root || '.')
    const configPath = join(projectRoot, 'commoners.config.ts')
    const pkgPath = join(projectRoot, 'package.json')

    ui.header('Commoners Init')

    // Check for existing config
    if (existsSync(configPath)) {
      ui.warning('commoners.config.ts already exists', 'Skipping config generation')
    } else {
      // Detect existing project type
      const hasViteConfig = existsSync(join(projectRoot, 'vite.config.ts')) || existsSync(join(projectRoot, 'vite.config.js'))
      const hasIndexHtml = existsSync(join(projectRoot, 'index.html'))
      const hasSrcDir = existsSync(join(projectRoot, 'src'))

      const configLines = [
        `import { defineConfig } from '@commoners/solidarity/config'`,
        ``,
        `export default defineConfig({`,
        `  name: '${projectRoot.split(/[\\/]/).pop() || 'my-app'}',`,
      ]

      // Pages
      if (hasIndexHtml) {
        configLines.push(``)
        configLines.push(`  // Your existing index.html is the default entry point`)
        configLines.push(`  // Add more pages here:`)
        configLines.push(`  // pages: {`)
        configLines.push(`  //   home: './index.html',`)
        configLines.push(`  //   about: './pages/about/index.html',`)
        configLines.push(`  // },`)
      }

      // Services placeholder
      configLines.push(``)
      configLines.push(`  // Declare backend services (Python, Rust, C++, or Node):`)
      configLines.push(`  // services: {`)
      configLines.push(`  //   api: { src: './src/services/api/index.ts' },`)
      configLines.push(`  // },`)

      // Electron config
      configLines.push(``)
      configLines.push(`  electron: {`)
      configLines.push(`    window: { width: 1200, height: 800 },`)
      configLines.push(`  },`)

      configLines.push(`})`)
      configLines.push(``)

      writeFileSync(configPath, configLines.join('\n'), 'utf8')
      ui.success('Created commoners.config.ts')

      if (hasViteConfig) {
        ui.info('Detected existing vite.config — Commoners extends Vite, so your config will be merged automatically')
      }
    }

    // Add scripts to package.json if it exists
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
        let modified = false

        if (!pkg.scripts) pkg.scripts = {}

        const scripts = {
          'dev': 'commoners',
          'dev:desktop': 'commoners --target desktop',
          'build': 'commoners build',
          'build:desktop': 'commoners build --target desktop',
          'build:mobile': 'commoners build --target mobile',
          'preview': 'commoners preview',
        }

        for (const [key, value] of Object.entries(scripts)) {
          if (!pkg.scripts[key]) {
            pkg.scripts[key] = value
            modified = true
          }
        }

        if (modified) {
          writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
          ui.success('Added commoners scripts to package.json')
        } else {
          ui.info('Scripts already exist in package.json')
        }
      } catch {
        ui.warning('Could not update package.json')
      }
    }

    ui.info('Next steps:')
    console.log('  1. Install commoners: pnpm add -D commoners@latest')
    console.log('  2. Run: pnpm dev')
    console.log('  3. For desktop: pnpm dev:desktop')
    console.log('')
    console.log('  See https://commoners.dev/getting-started for more')
  })

// Preview/launch the specified build
cli
  .command('launch [root]', 'Preview your built application')

  .alias('preview')

  .example('commoners preview')
  .example('commoners preview --target desktop')
  .example('commoners launch --service api')

  .option('--outDir <path>', 'Choose an output directory for your build files')
  .option('--service <name>', 'Launch service(s)')

  .option('--port <port>', 'Choose a port to launch on')
  .option('--public', 'Launch your service as public (services only)')

  .action(async (root, options) => {
    try {
      const { config: configPath, service, public: isPublic, port, stdin, ...overrides } = options
      const isOnlyServices = !overrides.target && service // Services take priority if specified

      preprocessTarget(overrides.target)
      const config = await getConfig({ root, config: configPath, stdin })
      if (!config) throw new CLIError('Configuration not found')
      const reconciledConfig = reconcile(config, overrides) as UserConfig
      const hooks = await resolveHooks(reconciledConfig.hooks, cliHooks) // Default hooks

    const start = message =>  hooks.ui.header(message)


    if (isOnlyServices) {

      start(`Launching Services Build`)

      delete reconciledConfig.target

      // NOTE: If passed, this simply wouldn't take effect
      if (options.outDir) throw new CLIError(`Cannot specify an output directory when launching services`, `Services are built in a private directory`)

      const resolvedServices = typeof service === 'string' ? [service] : service
      const nServices = Object.keys(resolvedServices).length
      if (nServices > 1 && (port || isPublic))
        throw new CLIError(`Cannot specify port or public when launching multiple services`, `Specify a single service to set port or public`)
      if (nServices === 1) {
        const serviceName = resolvedServices[0]
        if (serviceName in reconciledConfig.services) {
          const service = resolveServiceConfiguration(reconciledConfig.services[serviceName])
          Object.assign(service, { public: isPublic, port }) // Set host and port on single service
          reconciledConfig.services[serviceName] = service
        }
      }

      try {
        await launchServices(reconciledConfig, { services: resolvedServices })
        hooks.ui.success(`${renderCommaSeparatedList(resolvedServices.map(s => `${hooks.ui.target(s, { plain: true })} Service`))} successfully launched!`)
        return
      } catch (error) {

        return handleError(
          new CLIError(`Failed to launch ${renderCommaSeparatedList(resolvedServices.map(s => `${hooks.ui.target(s, { plain: true })} Service`))}`, error.message)
        )
      }
    }

      // Ensure services are not specified with a target
      else if (service) throw new CLIError(`Cannot specify both services and a launch target`, `Specify either a target or services to launch`)

      // Enhanced launch feedback
      await launch({ ...reconciledConfig, hooks })

    } catch (error) { handleError(error) }

  })

// Share services on the local network
cli
  .command('share [root]', 'Start and advertise services on the local network')

  .example('commoners share')
  .example('commoners share --service api')
  .example('commoners share --port 3000')
  .example('commoners share --meta "env=staging"')

  .option('--service <name>', 'Share specific service(s)')
  .option('--port <port>', 'Override port (single service only)')
  .option('--meta <kv>', 'Add metadata as key=value (passed as Bonjour txt records)')
  .option('--qr', 'Display QR code for service URLs')

  .action(async (root, options) => {
    try {
      const { config: configPath, service, port, meta, qr, stdin, ...overrides } = options
      const config = await getConfig({ root, config: configPath, stdin })
      if (!config) throw new CLIError('Configuration not found')
      const hooks = await resolveHooksForCLI(config.hooks, cliHooks)

      const selectedServices = service
        ? (typeof service === 'string' ? [service] : service)
        : undefined

      if (selectedServices && selectedServices.length > 1 && port)
        throw new CLIError('Cannot specify port when sharing multiple services', 'Specify a single service to set a port')

      // Parse --meta "key=value" into a record
      const parsedMeta: Record<string, string> = {}
      if (meta) {
        const metaEntries = typeof meta === 'string' ? [meta] : meta
        for (const entry of metaEntries) {
          const eqIdx = entry.indexOf('=')
          if (eqIdx > 0) parsedMeta[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1)
        }
      }

      hooks.ui.header('Sharing Services')

      const result = await shareServices(
        reconcile(config, overrides) as UserConfig,
        {
          services: selectedServices,
          port: port ? parseInt(port, 10) : undefined,
          hooks,
          meta: Object.keys(parsedMeta).length > 0 ? parsedMeta : undefined,
        }
      )

      const { active, localIP, cleanup } = result

      const serviceEntries = Object.entries(active)
      if (serviceEntries.length === 0) {
        hooks.ui.error('No services were started')
        process.exit(1)
      }

      // Build and display service status table
      const rows: string[] = []
      const publicUrls: string[] = []

      for (const [id, svc] of serviceEntries) {
        const url = (svc as any).url
        if (url) {
          try {
            const publicUrl = new URL(url)
            publicUrl.hostname = localIP
            const publicHref = publicUrl.href
            publicUrls.push(publicHref)
            rows.push(`  ${hooks.ui.target(id, { plain: true }).padEnd(20)} ${publicHref}`)
          } catch {
            rows.push(`  ${hooks.ui.target(id, { plain: true }).padEnd(20)} ${url}`)
          }
        } else {
          rows.push(`  ${hooks.ui.target(id, { plain: true }).padEnd(20)} (no URL)`)
        }
      }

      console.log()
      console.log(rows.join('\n'))
      console.log()

      // Show QR code for the first service URL (or all if --qr is set)
      if (qr && publicUrls.length > 0) {
        try {
          const qrcode = await import('qrcode-terminal')
          const generate = qrcode.default?.generate ?? qrcode.generate
          for (const url of publicUrls) {
            generate(url, { small: true }, (code: string) => {
              console.log(code)
              console.log(`  ${url}\n`)
            })
          }
        } catch {
          // qrcode-terminal not available, skip silently
        }
      }

      hooks.ui.success(`Sharing on ${localIP} — press Ctrl+C to stop`)

      // Keep running until Ctrl+C
      const onExit = () => {
        hooks.ui.header('Stopping shared services...')
        cleanup()
        process.exit(0)
      }
      process.on('SIGINT', onExit)
      process.on('SIGTERM', onExit)

    } catch (error) { handleError(error) }
  })

// Build the application using the specified settings
cli
  .command('build [root]', 'Build the application in the specified directory', {
    ignoreOptionDefaultValue: true,
  })

  .example('commoners build')
  .example('commoners build --target desktop')
  .example('commoners build --service api')
  .example('commoners build --services') // Force rebuild all services


  .option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
  .option('--service <name>', 'Build service(s)')
  .option('--services', 'Force all services to rebuild')
  .option('--publish [type]', 'Publish the application', { default: 'always' })
  .option('--sign', 'Enable code signing (desktop target on Mac only)')
  .option('--headless', 'Skip opening native IDEs (for CI or scripting)')
  .action(async (root, options) => {
    try {
      const { config: configPath, service, services, sign, publish, headless, stdin, ...overrides } = options
      if (headless) process.env.COMMONERS_HEADLESS = 'true'
      const { target: manualTarget } = overrides
      overrides.build = { sign, publish }

      preprocessTarget(manualTarget)
      const config = await getConfig({ root, config: configPath, stdin })
      if (!config) throw new CLIError('Configuration not found')
      const hooks = await resolveHooksForCLI(config.hooks, cliHooks)

      // Build Services Only
      const servicesToBuild = services ? Object.keys(config.services) : service
      if (!manualTarget && servicesToBuild) {
        const nServices = Array.isArray(servicesToBuild) ? Object.keys(servicesToBuild).length : 1
        hooks.ui.header(`Building Service${nServices > 1 ? 's' : ` (${servicesToBuild})`}`)
        try {
          await buildServices(config, { services: servicesToBuild, hooks })
          hooks.ui.success(`Service${nServices > 1 ? 's' : ""} successfully built!`)
        } catch (error) { handleError(new CLIError(`Failed to build service${nServices > 1 ? 's' : ''}`, error.message)) }
        return
      }

      const resolvedConfig = reconcile(config, overrides)
      const serviceBuildOptions: any = { hooks }
      if (servicesToBuild) serviceBuildOptions.rebuildServices = servicesToBuild
      await build(resolvedConfig, serviceBuildOptions)
    } catch (error) { handleError(error) }
  })

// Start the application in development mode
cli
  .command('[root]', 'Start the application in the specified directory', {
    ignoreOptionDefaultValue: true,
  })

  .example('commoners')
  .example('commoners --target desktop')
  .example('commoners --no-color')
  .example('cat config.json | commoners --stdin') // Use STDIN config

  .alias('start')
  .alias('dev')
  .alias('run')

  .action(async (root, options) => {
    try {
      const { config: configPath, stdin, ...overrides } = options
      preprocessTarget(overrides.target)
      const config = await getConfig({ root, config: configPath, stdin })
      if (!config) throw new CLIError('Configuration not found')
      const hooks = await resolveHooksForCLI(config.hooks, cliHooks)
      const resolvedConfig = reconcile(config, overrides)
      await start(resolvedConfig, { hooks })
    } catch (error) { handleError(error) }
  })

cli.help()
cli.version(pkg.version)

// Set log level BEFORE parsing (by checking argv directly)
// This ensures loggers are configured before CAC command actions run
const logLevelArgIndex = process.argv.findIndex(arg => arg === '--log-level' || arg === '-L')
if (logLevelArgIndex !== -1 && process.argv[logLevelArgIndex + 1]) {
  const levelString = process.argv[logLevelArgIndex + 1].toUpperCase()
  const levelMap: Record<string, LogLevel> = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARN,
    ERROR: LogLevel.ERROR,
    SILENT: LogLevel.SILENT,
  }
  const levelValue = levelMap[levelString]
  if (levelValue !== undefined) setGlobalLogLevel(levelValue)
}

cli.parse()

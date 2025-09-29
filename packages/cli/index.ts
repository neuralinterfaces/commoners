#!/usr/bin/env node

import {
  build,
  buildServices,
  launch,
  launchServices,
  resolveServiceConfiguration,
  start,
  loadConfigFromFile,

  // Types
  resolveConfig,
  resolveHooks,
  resolveAppToLaunch,
} from '@commoners/solidarity'

import pkg from './package.json' assert { type: 'json' }
import { ui } from './src/ui/index.js'
import { CLIHooks } from './src/hooks.js'
const cliHooks = new CLIHooks()

// Utilities
import cac from 'cac'
import { join } from 'path'
const desktopTargets = ['desktop', 'electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const allTargets = [...desktopTargets, ...mobileTargets, ...webTargets]

const reconcile = (userOpts = {}, cliOpts = {}, envOpts = {}) =>
  Object.assign({}, envOpts, userOpts, cliOpts) // CLI —> User —> Environment

const failed = (message, submessage?: string) => {
  ui.error(message, submessage)

  process.exit(1)
}

function preprocessTarget(target) {
  if (typeof target === 'string') {
    if (!allTargets.includes(target)) {
      const resolvedTargets = []
      for (const t of allTargets) resolvedTargets.push(ui.target(t))

      failed(`Invalid target: ${ui.target(target)}`, `Valid targets: ${resolvedTargets.join(', ')}`)
    }
  }
}

type ConfigOpts = {
  root?: string
  config?: string
}

const getConfigPathFromOpts = ({ root, config }: ConfigOpts) =>
  root ? (config ? join(root, config) : root) : config

const cli = cac()

function renderCommaSeparatedList(list: string[]) {
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return list.slice(0, -1).join(', ') + ' and ' + list.slice(-1)
}

// Launch the specified build
cli
  .command('launch [root]', 'Launch your build application in the specified directory')
  .option('--target <target>', 'Choose a target build to launch')
  .option('--outDir <path>', 'Choose an output directory for your build files')
  .option('--service <name>', 'Launch service(s)')
  .option('--config <path>', 'Specify a configuration file')

  .option('--port <port>', 'Choose a port to launch on')
  .option('--public', 'Launch your service as public (services only)')

  .action(async (root, options) => {
    const { config: configPath, service, public: isPublic, port, ...overrides } = options
    const isOnlyServices = !overrides.target && service // Services take priority if specified

    preprocessTarget(overrides.target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    if (!config) return failed('Configuration not found')
    const resolvedConfig = await resolveConfig(reconcile(config, overrides))

    let launchSpinner
    const start = message => {
      // launchSpinner = ui.spinner(message, { type: 'dots' })
      ui.header(message)
    }

    const succeed = (message: string, details?: string) => {
      ui.success(message, details)
      if (launchSpinner) launchSpinner.succeed(`${message}${details ? `: ${details}` : ''}`)
    }

    const failedHere = (message: string, details?: string) => {
      ui.error(message, details)
      if (launchSpinner) launchSpinner.fail(`${message}${details ? `: ${details}` : ''}`)
    }

    const hooks = await resolveHooks(config.hooks, cliHooks)

    if (isOnlyServices) {

      start(`Launching Services Build`)

      delete resolvedConfig.target

      // NOTE: If passed, this simply wouldn't take effect
      if (options.outDir)
        return failed(`Cannot specify an output directory when launching services`)

      const resolvedServices = typeof service === 'string' ? [service] : service
      const nServices = Object.keys(resolvedServices).length
      if (nServices > 1 && (port || isPublic))
        return failed(`Cannot specify port or public when launching multiple services`)
      if (nServices === 1) {
        const serviceName = resolvedServices[0]
        if (serviceName in resolvedConfig.services) {
          const service = resolveServiceConfiguration(resolvedConfig.services[serviceName])
          Object.assign(service, { public: isPublic, port }) // Set host and port on single service
          resolvedConfig.services[serviceName] = service
        }
      }

      try {
        await launchServices(resolvedConfig, { services: service })
        succeed(
          `${renderCommaSeparatedList(resolvedServices.map(s => `${ui.target(s, { plain: true })} Service`))} successfully launched!`
        )
        return
      } catch (error) {
        failedHere(
          `Failed to launch ${renderCommaSeparatedList(resolvedServices.map(s => `${ui.target(s, { plain: true })} Service`))}`,
          error.message
        )

        return process.exit(1)
      }
    }

    // Ensure services are not specified with a target
    else if (service) return failed(`Cannot specify both services and a launch target`)

    // Enhanced launch feedback
    await launch({ ...resolvedConfig, hooks })
  })

// Build the application using the specified settings
cli
  .command('build [root]', 'Build the application in the specified directory', {
    ignoreOptionDefaultValue: true,
  })
  .option('--target <target>', 'Choose a build target', { default: 'web' })
  .option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
  .option('--service <name>', 'Build service(s)')
  .option('--services', 'Force all services to rebuild')
  .option('--publish [type]', 'Publish the application', { default: 'always' })
  .option('--sign', 'Enable code signing (desktop target on Mac only)')
  .option('--config <path>', 'Specify a configuration file')
  .action(async (root, options) => {
    const { config: configPath, service, services, sign, publish, ...overrides } = options
    const { target: manualTarget } = overrides
    overrides.build = { sign, publish }

    preprocessTarget(manualTarget)

    // Load the configuration file
    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    if (!config) return failed('Configuration not found')

    const hooks = await resolveHooks(config.hooks, cliHooks)

    // Build Services Only
    const servicesToBuild = services ? Object.keys(config.services) : service
    if (!manualTarget && servicesToBuild) {
      ui.header('Building Services')
      try {
        await buildServices(config, { services: servicesToBuild, hooks })
        ui.success('All services ready for deployment!')
      } catch (error) {
        ui.error('Failed to build services', error.message)

        process.exit(1)
      }
      return
    }

    const resolvedConfig = reconcile(config, overrides)
    await build(resolvedConfig, { rebuildServices: servicesToBuild ?? false, hooks })

  })

// Start the application in development mode
cli
  .command('[root]', 'Start the application in the specified directory', {
    ignoreOptionDefaultValue: true,
  })
  .alias('start')
  .alias('dev')
  .alias('run')
  .option('--target <target>', 'Choose a development target', { default: 'web' })
  .option('--config <path>', 'Specify a configuration file')

  .action(async (root, options) => {
    const { config: configPath, ...overrides } = options
    preprocessTarget(overrides.target)
    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    const hooks = await resolveHooks(config.hooks, cliHooks)
    if (!config) return failed('Configuration not found')
    const resolvedConfig = reconcile(config, overrides)
    await start(resolvedConfig, { hooks })
  })

cli.help()
cli.version(pkg.version)

const run = async () => {
  const parsed = cli.parse()

  if (parsed.options.version) process.exit()

  if (parsed.options.help) process.exit()
}

run()

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

import { DefaultHooks, CommonersUI } from '@commoners/solidarity/ui'
const ui = new CommonersUI()
const cliHooks = new DefaultHooks(ui)

// Utilities
import cac from 'cac'
import { join } from 'path'
const desktopTargets = ['desktop', 'electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const allTargets = [...desktopTargets, ...mobileTargets, ...webTargets]

const reconcile = (userOpts = {}, cliOpts = {}, envOpts = {}) =>
  Object.assign({}, envOpts, userOpts, cliOpts) // CLI —> User —> Environment

function failed (message, submessage?: string) {
  this.ui.error(message, submessage)
  process.exit(1)
}

function preprocessTarget(target, hooks) {
  if (typeof target === 'string') {
    if (!allTargets.includes(target)) {
      const resolvedTargets = []
      for (const t of allTargets) resolvedTargets.push(hooks.ui.target(t))

      failed.call(hooks, `Invalid target: ${hooks.ui.target(target)}`, `Valid targets: ${resolvedTargets.join(', ')}`)
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

    preprocessTarget(overrides.target, cliHooks)
    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    if (!config) return failed.call(cliHooks, 'Configuration not found')
    const resolvedConfig = await resolveConfig(reconcile(config, overrides))
    const hooks = await resolveHooksForCLI(config.hooks, cliHooks)

    let launchSpinner
    const start = message => {
      // launchSpinner = ui.spinner(message, { type: 'dots' })
      hooks.ui.header(message)
    }

    const succeed = (message: string, details?: string) => {
      hooks.ui.success(message, details)
      if (launchSpinner) launchSpinner.succeed(`${message}${details ? `: ${details}` : ''}`)
    }

    const failedHere = (message: string, details?: string) => {
      hooks.ui.error(message, details)
      if (launchSpinner) launchSpinner.fail(`${message}${details ? `: ${details}` : ''}`)
    }


    if (isOnlyServices) {

      start(`Launching Services Build`)

      delete resolvedConfig.target

      // NOTE: If passed, this simply wouldn't take effect
      if (options.outDir) return failed.call(hooks, `Cannot specify an output directory when launching services`, `Services are built in a private directory`)

      const resolvedServices = typeof service === 'string' ? [service] : service
      const nServices = Object.keys(resolvedServices).length
      if (nServices > 1 && (port || isPublic))
        return failed.call(hooks, `Cannot specify port or public when launching multiple services`, `Specify a single service to set port or public`)
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
          `${renderCommaSeparatedList(resolvedServices.map(s => `${hooks.ui.target(s, { plain: true })} Service`))} successfully launched!`
        )
        return
      } catch (error) {
        failedHere(
          `Failed to launch ${renderCommaSeparatedList(resolvedServices.map(s => `${hooks.ui.target(s, { plain: true })} Service`))}`,
          error.message
        )

        return process.exit(1)
      }
    }

    // Ensure services are not specified with a target
    else if (service) return failed.call(hooks, `Cannot specify both services and a launch target`, `Specify either a target or services to launch`)

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

    preprocessTarget(manualTarget, cliHooks)
    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    if (!config) return failed.call(cliHooks, 'Configuration not found')
    const hooks = await resolveHooksForCLI(config.hooks, cliHooks)

    // Build Services Only
    const servicesToBuild = services ? Object.keys(config.services) : service
    if (!manualTarget && servicesToBuild) {
      hooks.ui.header('Building Services')
      try {
        await buildServices(config, { services: servicesToBuild, hooks })
        hooks.ui.success('All services ready for deployment!')
      } catch (error) {
        hooks.ui.error('Failed to build services', error.message)

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
    preprocessTarget(overrides.target, cliHooks)
    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    if (!config) return failed.call(cliHooks, 'Configuration not found')
    const hooks = await resolveHooksForCLI(config.hooks, cliHooks)
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

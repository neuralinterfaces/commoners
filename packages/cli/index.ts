#!/usr/bin/env node

import { 
    build, 
    launch, 
    start,
    loadConfigFromFile,
    format,

    // Types
    LaunchConfig
} from "@commoners/solidarity";

import pkg from './package.json' assert { type: "json" }

// Utilities
import cac from 'cac'
import { join } from "path";
const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const serviceTargets = ['services']
const allTargets = [...serviceTargets, ...desktopTargets, ...mobileTargets, ...webTargets]

const reconcile = (userOpts = {}, cliOpts = {}, envOpts = {}) => Object.assign({}, envOpts, userOpts, cliOpts) // CLI —> User —> Environment

const failed = async (message, submessage?: string) => {
    await format.printFailure(message)
    if (submessage) await format.printSubtle(submessage)
    process.exit(1)
}   
async function preprocessTarget(target) {
    if (typeof target === 'string') {
        if (!allTargets.includes(target)) await failed(`'${target}' is not a valid target.`, `Valid targets: ${allTargets.join(', ')}`)
    }
}

type ConfigOpts = {
    root?: string
    config?: string
}

const getConfigPathFromOpts = ({ root, config }: ConfigOpts) => root ? (config ? join(root, config) : root) : config

const cli = cac()


// Launch the specified build
cli.command('launch [root]', 'Launch your build application in the specified directory')
.option('--target <target>', 'Choose a target build to launch')
.option('--outDir <path>', 'Choose an output directory for your build files')
.option('--service <name>', 'Launch service(s)')
.option('--config <path>', 'Specify a configuration file')

.option('--port <port>', 'Choose a port to launch on')
.option('--host <host>', 'Choose a host to launch on (services only)')

.action(async (root, options) => {

    const { config: configPath, service, ...overrides } = options

    const services = service
    const isOnlyServices = (!overrides.target && services)

    await preprocessTarget(overrides.target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({ root, config: configPath }))
    
    if (!config) return


    // Services take priority if specified
    if (isOnlyServices) {

        delete config.target

        // Do not use configuration options for servers
        delete config.port 
        delete config.host

        // NOTE: If passed, this simply wouldn't take effect
        if (options.outDir) return await failed(`Cannot specify an output directory when launching services`)

        const resolvedServices = typeof services === 'string' ? [services] : services

        // If specified, this simply wouldn't take effect
        if (Object.keys(resolvedServices).length > 1 && (options.port || options.host)) return await failed(`Cannot specify port or host when launching multiple services`)
        
        // Flag invalid services
        for (const service of resolvedServices) {
            if (!config.services[service]) await failed(`Service '${service}' not found in configuration`)
        }
        
        // Clear unspecified services
        Object.keys(config.services).forEach(service => {
            if (!resolvedServices.includes(service)) delete config.services[service]
        })
    }

    // Ensure services are not specified with a target
    else if (services) return await failed(`Cannot specify services without a target`)

    const launchConfig = reconcile(config, overrides) as LaunchConfig
    launch(launchConfig, isOnlyServices)
})

// Build the application using the specified settings
cli.command('build [root]', 'Build the application in the specified directory', { ignoreOptionDefaultValue: true })
.option('--target <target>', 'Choose a build target', { default: 'web' })
.option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
.option('--service <name>', 'Build service(s)')
.option('--publish [type]', 'Publish the application', { default: 'always'})
.option('--sign', 'Enable code signing (desktop target on Mac only)')
.option('--config <path>', 'Specify a configuration file')
.action(async (root, options) => {

    const { config: configPath, service, ...overrides } = options
    const { target } = overrides

    const buildOnlyServices = !target && service
    await preprocessTarget(target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({
        root,
        config: configPath
    }))

    if (!config) return


    if (buildOnlyServices) delete config.target // Ensure services are built only

    build(reconcile(config, overrides), { servicesToBuild: service })
})

// Start the application in development mode
cli.command('[root]', 'Start the application in the specified directory', { ignoreOptionDefaultValue: true })
.alias('start')
.alias('dev')
.alias('run')
.option('--target <target>', 'Choose a development target', { default: 'web' })
.option('--config <path>', 'Specify a configuration file')

.action(async (root, options) => {

    const { config: configPath, ...overrides } = options

    await preprocessTarget(overrides.target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({
        root,
        config: configPath
    }))

    if (!config) return

    start(reconcile(config, overrides))
})

cli.help()
cli.version(pkg.version)

const parsed = cli.parse()
if (parsed.options.version) process.exit()
if (parsed.options.help) process.exit()
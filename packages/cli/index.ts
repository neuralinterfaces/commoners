#!/usr/bin/env node

import { 
    build, 
    launch, 
    start,
    loadConfigFromFile,
    format
} 

from "@commoners/solidarity";

import pkg from './package.json'

// Utilities
import cac from 'cac'
import { join } from "path";
const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const serviceTargets = ['services']
const allTargets = [...serviceTargets, ...desktopTargets, ...mobileTargets, ...webTargets]

const reconcile = (userOpts = {}, cliOpts = {}, envOpts = {}) => Object.assign({}, envOpts, userOpts, cliOpts) // CLI —> User —> Environment

async function preprocessTarget(target) {
    if (typeof target === 'string') {
        if (!allTargets.includes(target)) {
            await format.printFailure(`'${target}' is not a valid target.`)
            await format.printSubtle(`Valid targets: ${allTargets.join(', ')}`)
            process.exit(1)
        }
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
.action(async (root, options) => {

    await preprocessTarget(options.target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({ root }))

    launch({
        ...config,
        ...options,
    })
})

// Build the application using the specified settings
cli.command('build [root]', 'Build the application in the specified directory', { ignoreOptionDefaultValue: true })
.option('--target <target>', 'Choose a build target', { default: 'web' })
.option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
.option('--service <name>', 'Build service(s)', { default: 'all' })
.option('--publish [type]', 'Publish the application', { default: 'always'})
.option('--sign', 'Enable code signing (desktop target on Mac only)')
.option('--config <path>', 'Specify a configuration file')
.action(async (root, options) => {

    const buildOnlyServices = !options.target && options.service

    await preprocessTarget(options.target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({
        root,
        config: options.config
    }))

    // Ensure services are built only
    if (buildOnlyServices) {
        delete config.target
        options.services = options.service
    }

    delete options.service

    if (!config) return

    build({
        ...config,
        build: reconcile(config.build, options)
    })
})

// Start the application in development mode
cli.command('[root]', 'Start the application in the specified directory', { ignoreOptionDefaultValue: true })
.alias('start')
.alias('dev')
.alias('run')
.option('--target <target>', 'Choose a development target', { default: 'web' })
.option('--config <path>', 'Specify a configuration file')

.action(async (root, options) => {

    await preprocessTarget(options.target)

    const config = await loadConfigFromFile(getConfigPathFromOpts({
        root,
        config: options.config
    }))

    if (!config) return

    const startOpts = reconcile(config, options, { port: process.env.PORT ? parseInt(process.env.PORT) : undefined })
    start(startOpts)
})

cli.help()
cli.version(pkg.version)

const parsed = cli.parse()
if (parsed.options.version) process.exit()
if (parsed.options.help) process.exit()
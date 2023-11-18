#!/usr/bin/env node

import { 
    share, 
    build, 
    launch, 
    start, 
    initialize
} 
from "@commoners/solidarity";

// Utilities
import { resolveFile } from "./utils.js";

import cac from 'cac'

const configPath = resolveFile('commoners.config', ['.ts', '.js'])

const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const allTargets = [...desktopTargets, ...mobileTargets, ...webTargets]

function preprocessTarget(target) {
    if (typeof target === 'string') {
        if (!allTargets.includes(target)) {
            console.error(`'${target}' is not a valid target. Allowed targets: ${allTargets.join(', ')}`)
            process.exit(1)
        }
    }
}

const cli = cac()

// Launch the specified build
cli.command('launch', 'Launch your build application')
.option('--target <target>', 'Choose a target build to launch', { default: 'web' })
.action((options) => {
    preprocessTarget(options.target)
    launch(options)
})

// Share services 
cli.command('share', 'Share the application')
.option('--service <name>', 'Share specific service(s)')
.option('--port <number>', 'Choose a port to share your services at')
.action((options) => {
    share(configPath, options.port, {
        services: options.service,
        port: options.port || process.env.PORT 
    })
})

// Build the application using the specified settings
cli.command('build', 'Build the application', { ignoreOptionDefaultValue: true })
.option('--target <target>', 'Choose a build target', { default: 'web' })
.option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
.option('--services', 'Build all services')
.option('--service <name>', 'Build specific service(s)')
.option('--publish', 'Publish the application')
.action((options) => {

    preprocessTarget(options.target)

    build(configPath, {
        target: options.target, 
        services: options.service || options.services,
        publish: options.publish,
        outDir: options.outDir
    })
})

// Start the application in development mode
cli.command('', 'Start the application', { ignoreOptionDefaultValue: true })
.alias('start')
.alias('dev')
.alias('run')
.option('--target <target>', 'Choose a build target to simulate', { default: 'web' })
.option('--services', 'Run all services')
.option('--service <name>', 'Run specific service(s)')
.option('--port <number>', 'Choose a target port (single service only)')
.action((options) => {
    console.log(options)
    preprocessTarget(options.target)
    start(configPath, {
        target: options.target, 
        services: options.service || options.services,
        port: options.port || process.env.PORT 
    })
})

cli.help()
cli.version('0.0.0')

const parsed = cli.parse()
if (parsed.options.version) process.exit()
if (parsed.options.help) process.exit()

initialize()
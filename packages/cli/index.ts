#!/usr/bin/env node

import { 
    share, 
    build, 
    launch, 
    start,
    loadConfigFromFile,
    ShareOptions
} 
from "@commoners/solidarity";

import pkg from './package.json'


// Utilities
import cac from 'cac'
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from 'node:url';
import { dirname, join } from "node:path";

const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const serviceTargets = ['services']
const allTargets = [...serviceTargets, ...desktopTargets, ...mobileTargets, ...webTargets]

const reconcile = (userOpts = {}, cliOpts = {}, envOpts = {}) => Object.assign({}, envOpts, userOpts, cliOpts) // CLI —> User —> Environment

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
.option('--outDir <path>', 'Choose the output directory of your build files')
.action((options) => {
    preprocessTarget(options.target)
    launch(options)
})

// Share services 
cli.command('share', 'Share the application')
.option('--service <name>', 'Share specific service(s)')
.option('--port <number>', 'Choose a port to share your services at')
.action(async (options) => {
    
    const sharePort = options.port || process.env.COMMONERS_SHARE_PORT
    const customPort = process.env.PORT ? parseInt(process.env.PORT) : undefined

    const config = await loadConfigFromFile()

    share({
        ...config,
        share: reconcile(config.share, options, { port: sharePort || customPort }) as ShareOptions['share']
    })
})

// Build the application using the specified settings
cli.command('build', 'Build the application', { ignoreOptionDefaultValue: true })
.option('--target <target>', 'Choose a build target', { default: 'web' })
.option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
.option('--no-services', 'Skip building the services')
.option('--service <name>', 'Build specific service(s)')
.option('--publish', 'Publish the application')
.option('--sign', 'Enable code signing (desktop target on Mac only)')
.option('--root <path>', 'Specify the root directory of the project')
.action(async (options) => {

    if (options.target !== 'services') preprocessTarget(options.target)

    const config = await loadConfigFromFile(options.root)

    build({
        ...config,
        build: reconcile(config.build, options)
    })
})

// Start the application in development mode
cli.command('', 'Start the application', { ignoreOptionDefaultValue: true })
.alias('start')
.alias('dev')
.alias('run')
.option('--target <target>', 'Choose a build target to simulate', { default: 'web' })
.option('--port <number>', 'Choose a target port (single service only)')
.option('--root <path>', 'Specify the root directory of the project')
.action(async (options) => {
    preprocessTarget(options.target)
    const startOpts = reconcile(await loadConfigFromFile(options.root), options, { port: process.env.PORT ? parseInt(process.env.PORT) : undefined })
    start(startOpts)
})

cli.help()
cli.version(pkg.version)

const parsed = cli.parse()
if (parsed.options.version) process.exit()
if (parsed.options.help) process.exit()
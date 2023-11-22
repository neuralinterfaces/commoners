#!/usr/bin/env node

import { 
    share, 
    build, 
    launch, 
    start
} 
from "@commoners/solidarity";

// Utilities
import { resolveFile } from "./utils.js";

import cac from 'cac'
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from 'node:url';
import { dirname, join } from "node:path";

const configPath = resolveFile('commoners.config', ['.ts', '.js'])

const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const serviceTargets = ['services']
const allTargets = [...serviceTargets, ...desktopTargets, ...mobileTargets, ...webTargets]

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
    
    const sharePort = options.port || process.env.COMMONERS_SHARE_PORT
    const customPort = process.env.PORT ? parseInt(process.env.PORT) : undefined

    share(configPath, sharePort, {
        services: options.service,
        port: customPort
    })
})

// Build the application using the specified settings
cli.command('build', 'Build the application', { ignoreOptionDefaultValue: true })
.option('--target <target>', 'Choose a build target', { default: 'web' })
.option('--outDir <path>', 'Choose an output directory for your build files') // Will be directed to a private directory otherwise
.option('--no-services', 'Skip building the services')
.option('--service <name>', 'Build specific service(s)')
.option('--publish', 'Publish the application')
.action((options) => {

    if (options.target !== 'services') preprocessTarget(options.target)

    build(configPath, {
        target: options.target, 
        services: options.services === false ? false : options.service,
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
.option('--port <number>', 'Choose a target port (single service only)')
.action((options) => {
    preprocessTarget(options.target)
    start(configPath, {
        target: options.target, 
        port: options.port || process.env.PORT 
    })
})

cli.help()

// Get package.json version
const pkgFileName = 'package.json'
const __dirname = dirname(fileURLToPath(import.meta.url)) //process.cwd() //fileURLToPath(new URL('.', import.meta.url));
const version = JSON.parse(readFileSync(join(__dirname, `${existsSync(join(__dirname, pkgFileName)) ? '' : '../'}${pkgFileName}`)).toString()).version
cli.version(version)

const parsed = cli.parse()
if (parsed.options.version) process.exit()
if (parsed.options.help) process.exit()
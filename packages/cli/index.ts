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

const cli = cac()

cli.option('--outDir <path>', 'Choose an output directory') // Will be directed to the private directory

cli.option('--target <target>', 'Choose a build target', { default: 'web' })

cli.option('--port <number>', 'Choose a target port')

cli.option('--service <name>', 'Select specific services')

cli.option('--services', 'Run all services')

cli.help()
cli.version('0.0.0')

const parsed = cli.parse()
if (parsed.options.version) process.exit()
if (parsed.options.help) process.exit()

console.log(JSON.stringify(parsed, null, 2))

initialize()

const outDir = parsed.options.outDir
const COMMAND = parsed.args[0] as string
const TARGET = parsed.options.target

// Confirm correct target
const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']
const allTargets = [...desktopTargets, ...mobileTargets, ...webTargets]
if (typeof parsed.options.target === 'string') {
    if (!allTargets.includes(TARGET)) {
        console.error(`'${TARGET}' is not a valid target. Allowed targets: ${allTargets.join(', ')}`)
        process.exit(1)
    }
}

const configPath = resolveFile('commoners.config', ['.ts', '.js'])

const port = parsed.options.port
const customGlobalPort = port || process.env.PORT // Railway and simple sharing support

const buildOptions = {
    target: TARGET, 
    services: parsed.options.service || parsed.options.services,
    publish: parsed.options.publish,
    outDir
}

// Launch the specified build
if (COMMAND === 'launch') launch({ 
    target: TARGET, 
    outDir, 
    port 
})

// Share services 
else if (COMMAND === 'share') share(configPath, customGlobalPort, {
    services: buildOptions.services,
    port: customGlobalPort
})

// Build the application using the specified settings
else if (COMMAND === 'build') build(configPath, buildOptions)

// Start the application in development mode
else if (!COMMAND) start(configPath, {
    ...buildOptions,
    port: customGlobalPort
})

else throw new Error(`'${COMMAND}' is an invalid command.`)

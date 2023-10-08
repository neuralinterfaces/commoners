#!/usr/bin/env node

import chalk from "chalk";

import { onExit as processOnExit } from "../core/utils/processes.js";
import { cliArgs, command, COMMAND, PLATFORM, target, TARGET } from "../core/globals.js";
import { share, build, createServer, launch, loadConfigFromFile, configureForDesktop, resolveConfig, createServices } from "../core/index.js";
import { clearOutputDirectory, populateOutputDirectory } from "../core/common.js";

// Error Handling for CLI
const onExit = (...args) => processOnExit(...args)

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})

process.on('beforeExit', onExit);

const baseOptions = { target: TARGET, platform: PLATFORM }

if (command.launch) launch(baseOptions) // Launch the specified build
else if (command.share) share()
else if (command.build) build(baseOptions) // Build the application using the specified settings
else if (command.dev || command.start || !command) {

        const config = await loadConfigFromFile() // Load configuration file only once

        const resolvedConfig = await resolveConfig(config);

        const runServices = cliArgs.services || cliArgs.service

        const onlyRunServices = !cliArgs.frontend && runServices

        // Only run services
        if (onlyRunServices) await createServices(resolvedConfig)
        
        // Run services alongside the frontend
        else {

            const runFrontendWithServices = !cliArgs.frontend || runServices

            if (target.mobile) await build(baseOptions, resolvedConfig) // Create mobile build
            else {
                await clearOutputDirectory()
                await populateOutputDirectory(resolvedConfig)
            }

            if (target.desktop) await configureForDesktop() // Configure the desktop instance
            else if (runFrontendWithServices) await createServices(resolvedConfig) // Run services in parallel


            if (!target.mobile) await createServer(config, !target.desktop) // Create frontend server

        }

}

else throw new Error(`'${COMMAND}' is an invalid command.`)

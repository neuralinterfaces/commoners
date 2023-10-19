#!/usr/bin/env node

import chalk from "chalk";

import { 
    kill as killAllActiveProcesses, 
    clearOutputDirectory, 
    populateOutputDirectory,
    
    // Main command hadlers
    share, 
    build, 
    createServer, 
    launch, 
    createServices, 

    // Utilities
    loadConfigFromFile, 
    configureForDesktop, 
    resolveConfig, 
    globals 

} from "@commoners/solidarity";

const { cliArgs, command, COMMAND, PLATFORM, target, TARGET } = globals


// Error Handling for CLI
process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    killAllActiveProcesses()
})

process.on('beforeExit', killAllActiveProcesses);

const baseOptions = { target: TARGET, platform: PLATFORM }

if (command.launch) launch(baseOptions, cliArgs.port) // Launch the specified build
else if (command.share) share(cliArgs.port || process.env.PORT)
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


            if (!target.mobile) await createServer(config, { 
                printUrls: !target.desktop,
                pwa: cliArgs.pwa
            }) // Create frontend server

        }

}

else throw new Error(`'${COMMAND}' is an invalid command.`)

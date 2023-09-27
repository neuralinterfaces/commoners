#!/usr/bin/env node

import chalk from "chalk";

// import { initGitRepo } from "./src/github/index.js";
import { onExit as processOnExit } from "../core/utils/processes.js";
import { cliArgs, command, COMMAND, PLATFORM, target, TARGET } from "../core/globals.js";
import { build, commit, createServer, launch, loadConfigFromFile, publish, configureForDesktop, resolveConfig, createServices } from "../core/index.js";
import { clearOutputDirectory, populateOutputDirectory } from "../core/common.js";

// Error Handling for CLI
const onExit = (...args) => processOnExit(...args)

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})

process.on('beforeExit', onExit);

const baseOptions = { target: TARGET, platform: PLATFORM }

if (command.launch) launch(baseOptions)
else if (command.commit) commit({ message: cliArgs.message })
else if (command.publish) publish({ message: cliArgs.message })
else {
    const config = await loadConfigFromFile() // Load configuration file only once...
    if (command.build) build(baseOptions, config)
    else if (command.dev || command.start || !command) {

        const resolvedConfig = await resolveConfig(config);

        if (target.mobile) await build(baseOptions, resolvedConfig) // Create mobile build
        else {
            await clearOutputDirectory()
            await populateOutputDirectory(resolvedConfig)
        }

        if (target.desktop) configureForDesktop() // Configure the desktop instance
        else await createServices(resolvedConfig) // Run services in parallel


        if (!target.mobile) await createServer(config, !target.desktop) // Create frontend server

    }
    else throw new Error(`'${COMMAND}' is an invalid command.`)
}
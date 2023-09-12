#!/usr/bin/env node

import chalk from "chalk";

// import { initGitRepo } from "./src/github/index.js";
import { onExit as processOnExit } from "../core/utils/processes.js";
import { cliArgs, command, COMMAND, PLATFORM, TARGET } from "../core/globals.js";
import { build, commit, createServer, launch, loadConfigFromFile, publish, start } from "../core/index.js";

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
    if (command.dev || !COMMAND) createServer(config)
    else if (command.start) start(config)
    else if (command.build) build(baseOptions, config)
    else throw new Error(`'${COMMAND}' is an invalid command.`)
}
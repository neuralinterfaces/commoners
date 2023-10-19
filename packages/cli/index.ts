#!/usr/bin/env node

import { 
    share, 
    build, 
    launch, 
    start, 
} 
// from "@commoners/solidarity";
from "../core/index";

import {

    // Resolved Values
    TARGET,
    COMMAND,

    // Booleans
    outDir,
    cliArgs,
    configPath

} from './globals'

const port = cliArgs.port
const customGlobalPort = port || process.env.PORT // Railway and simple sharing support

const buildOptions = {
    target: TARGET, 
    frontend: cliArgs.frontend,
    services: cliArgs.service && cliArgs.services,
    publish: cliArgs.publish,
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

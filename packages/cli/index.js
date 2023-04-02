#!/usr/bin/env node

import chalk from "chalk";
import minimist from 'minimist';
import path from "path";

const cliArgs = minimist(process.argv.slice(2))
const args = cliArgs._

import { initGitRepo } from "./src/github/index.js";
import { resolveFile, createDirectory, createFile, getJSON, deleteDirectory, exists } from "./src/files.js";
import { spawnProcess, onExit as processOnExit } from "./src/processes.js";
import * as typescript from "./src/typescript.js";
import { __dirname } from "./globals.js";
import { readFileSync } from "fs";
import { getConfig } from "./src/config.js";
import { createService, createFrontend, createPackage } from "./src/create.js";

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const createReadableName = (name) => name.split('-').map(capitalize).join(' ')

const userPkg = getJSON('package.json')

const onExit = (...args) => {
    processOnExit(...args)
}

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})


process.on('beforeExit', onExit);


const [ command, option ] = args

// Global Variables
const isTypescriptProject = exists('tsconfig.json') || cliArgs.typescript

let config = await getConfig(undefined, command)

if (command === 'init') {

    const cliName = cliArgs.name
    const isConfig = (config={}) => Object.keys(config).length
    const transformName = (name) => name?.toLowerCase().split(' ').join('-')

    let name = transformName(cliName ?? (isConfig(config) ? undefined : userPkg.name)) // Get name from CLI, config, or package.json
    
    const rejectInitializedConfig = (config, target) => {
        if (isConfig(config)) {
            console.error(chalk.red(`${target} is already a commoners project.`))
            process.exit()
        }
    }
    // Create Project Directory (if not already in one)
    if (name) {
        const newDirPath = path.join(process.cwd(), name)
        config = await getConfig(newDirPath) // Re-fetch config
        rejectInitializedConfig(config, name)
        createDirectory(name)
        process.chdir(name);
    }

    rejectInitializedConfig(config, path.basename(process.cwd()))

    // Create config file to use as the base for the project
    if (!name) name = path.basename(process.cwd())
    const ext = isTypescriptProject ? '.ts' : '.js'
    const filepath = `commoners.config${ext}`
    const templatepath = path.join(__dirname, 'src', 'templates', `commoners.config.ts`)
    let templateFileText = readFileSync(templatepath).toString()
    templateFileText = templateFileText.replace(/name: .*,/g, `name: "${createReadableName(name)}",`)
    const newFilePath = createFile(filepath, templateFileText)
    config = await getConfig(path.dirname(newFilePath))

    // Resolve final name
    name = config.name.toLowerCase().split(' ').join('-')


    // Create Template Directories

    const frontendEntrypoint = cliArgs.frontend ?? config.frontend ?? 'frontend'

    const frontendDir = path.dirname(frontendEntrypoint)
    createDirectory(frontendDir)

    // Create Template Root Files
    createFile('index.html', () => {
        const file = readFileSync(path.join(__dirname, 'src/templates/index.html')).toString()
        return file.replace(/commoners-project/g, createReadableName(name))
    })

    createFile('LICENSE', () => readFileSync(path.join(__dirname, 'src/templates/LICENSE')))
    
    const pkg = createPackage(name)
    
    createFrontend(frontendDir, pkg)

    // Create Template Backend Files
    const servicesEntrypoints = config.services ?? {}
    Object.entries(servicesEntrypoints).forEach(([name, entrypoint]) => createService(name, entrypoint, pkg))

    console.log(chalk.green(`${name ?? "Project" } initialized!`))
}


else if (command === 'start') spawnProcess(`tauri`, ['start'])


let latestPort = 3769

const devCommands = {

    // Run Vite with Template or User-Defined Config
    frontend: () => spawnProcess(`vite`, ['dev', '--config', `${resolveFile('vite.config', ['.ts', '.js'], () => path.join(__dirname, 'src/templates/vite.config.ts'))}`]),
    
    // Run Services + Pass Port as First Argument
    services: async (options) => {
        if (options === true) options = config.services
        Object.entries(options).forEach(async ([service, toRun]) => {
            if (toRun) {
                const entrypoint = config.services[service]
                const serviceFile = resolveFile(entrypoint, ['.ts', '.js'])
                if (serviceFile) {
                    const customEnv =  { COMMONERS_PORT: latestPort, COMMONERS_NAME: service }
                    latestPort++
                    if (serviceFile.slice(-3) === '.ts') spawnProcess('node', [await typescript.transpile(serviceFile, config)], customEnv)
                    else spawnProcess('node', [serviceFile] , customEnv)
                }
            }
        })
    },
    desktop: () => spawnProcess(`tauri`, ['dev'])
}

const buildCommands = {
    ios: () => console.log('Building for iOS'),
    android: () => console.log('Building for android'),
    desktop: () => console.log('Building for desktop'),
    pwa: () => console.log('Building for PWA'),
    services: () => console.log('Building the services'),
    frontend: () => spawnProcess(`vite`, ['build', '--config', `${resolveFile('vite.config', ['.ts', '.js'], () => path.join(__dirname, 'src/templates/vite.config.ts'))}`])
}

const publishCommands = {
    github: {
        repo: () => initGitRepo(...args),
        pages: () => console.log('Publishing to GitHub Pages'),
        release: () => console.log('Publishing to GitHub Releases'),
    },
    npm: () => console.log('Publishing to NPM'),    
    docker: () => console.log('Publishing to Docker'),
    services: () => console.log('Publishing the services somewhere')
}

const checkCommands = (baseCommand, commands, config = {}) => {
    if (baseCommand === command) {
        for (const [key, value] of Object.entries(commands)) {
            if (option === key || (!option && config[key])) {
                if (typeof value === 'function') value(config[key]) // Pass configuration options
                else checkCommands(key, value, config[key])
            }
        }
    }
}

checkCommands('dev', devCommands, config.dev)
checkCommands('build', buildCommands, config.build)
checkCommands('publish', publishCommands, config.publish)
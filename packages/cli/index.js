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
import { getConfig, getFile } from "./src/config.js";
import { createService, createFrontend, createPackage } from "./src/create.js";

// New electron-vite calls
import { preview, defineConfig, createServer } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'


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


const [command, option] = args

// Global Variables
const isTypescriptProject = exists('tsconfig.json') || cliArgs.typescript

let config = await getConfig(undefined, command)

if (command === 'init') {

    const cliName = cliArgs.name
    const isConfig = (config = {}) => Object.keys(config).length
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

    console.log(chalk.green(`${name ?? "Project"} initialized!`))
}


else if (command === 'start') spawnProcess(`tauri`, ['start'])


// "build:desktop": "CI=true tauri build",
// "dev:desktop": "tauri dev",

// "init:android": "npx cap add android && npm run copy",
// "init:ios": "npx cap add ios && npm run copy",
// "copy": "npx cap copy",
// "android": "npx cap open android",
// "ios": "npx cap open ios"
const buildCommands = {
    ios: () => console.log('Building for iOS'),
    android: () => console.log('Building for android'),
    desktop: () => spawnProcess(`CI=true`, ['tauri', 'build']), //, '--config', `${resolveFile('.commoners/tauri.conf', ['.json'], () => path.join(__dirname, 'src/templates/tauri.conf.json'))}`]),
    pwa: () => console.log('Building for PWA'),
    services: () => console.log('Building the services'),
    // frontend: () => spawnProcess(`vite`, ['build', '--config', `${resolveFile('vite.config', ['.ts', '.js'], () => path.join(__dirname, 'src/templates/vite.config.ts'))}`])
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

if (command === 'dev') {

    const isServe = command === 'serve'
    const isBuild = command === 'build'
    const sourcemap = isServe || !!process.env.VSCODE_DEBUG

    const fullConfig = defineConfig({

        plugins: [
            electron([
                {
                    // Main-Process entry file of the Electron App.
                    entry: path.join(__dirname, '..', '..', 'template/src/main/index.ts'),
                    onstart(options) {
                        if (process.env.VSCODE_DEBUG) {
                            console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
                        } else {
                            options.startup()
                        }
                    },
                    vite: {
                        build: {
                            sourcemap,
                            minify: isBuild,
                            outDir: '.commoners/dist/main',
                            rollupOptions: {
                                external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                            },
                        },
                    },
                },
                {
                    entry: path.join(__dirname, '..', '..', 'template/src/preload/index.ts'),
                    onstart(options) {
                        // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
                        // instead of restarting the entire Electron App.
                        options.reload()
                    },
                    vite: {
                        build: {
                            sourcemap: sourcemap ? 'inline' : undefined, // #332
                            minify: isBuild,
                            outDir: '.commoners/dist/preload',
                            rollupOptions: {
                                external: Object.keys('dependencies' in userPkg ? userPkg.dependencies : {}),
                            },
                        },
                    },
                }
            ]),

            // Use Node.js API in the Renderer-process
            renderer(),
        ],
        
        server: process.env.VSCODE_DEBUG && (() => {
            const url = new URL(userPkg.debug.env.VITE_DEV_SERVER_URL)
            return {
                host: url.hostname,
                port: +url.port,
            }
        })(),
        clearScreen: false,
    })

    const server = await createServer(fullConfig)
    await server.listen()
    server.printUrls()
}

else {
    checkCommands('build', buildCommands, config.build)
    checkCommands('publish', publishCommands, config.publish)
}
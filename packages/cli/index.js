#!/usr/bin/env node

import chalk from "chalk";
import minimist from 'minimist';
import path from "path";


const cliArgs = minimist(process.argv.slice(2))
const args = cliArgs._

import { initGitRepo } from "./src/github/index.js";
import { createDirectory, createFile, exists, resolveFile } from "./src/files.js";
import { spawnProcess, onExit as processOnExit } from "./src/processes.js";
import { __dirname, baseOutDir, commonersPkg, userPkg } from "./globals.js";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, write, writeFileSync } from "fs";
import { getConfig } from "./src/config.js";
import { createService, createFrontend, createPackage } from "./src/create.js";

const [command, ...options] = args
let config = await getConfig(undefined, command)
const configPath = resolveFile('commoners.config', ['.ts', '.js'])

const templateDir = path.join(__dirname, '..', '..', 'template')
import * as yaml from 'js-yaml'
const buildConfig = yaml.load(readFileSync(path.join(templateDir, 'electron-builder.yml')).toString())

buildConfig.productName = userPkg.name

// Derive Electron version
if (!('electronVersion' in buildConfig)) {
    const electronVersion = commonersPkg.devDependencies.electron
    if (electronVersion[0] === '^') buildConfig.electronVersion = electronVersion.slice(1)
    else buildConfig.electronVersion = electronVersion
}

// Ensure proper absolute paths are provided for signing
const buildResources = buildConfig.directories.buildResources = path.join(templateDir, 'build')

buildConfig.afterSign = path.join(templateDir, buildConfig.afterSign)
buildConfig.mac.entitlementsInherit = path.join(templateDir, buildConfig.mac.entitlementsInherit)
buildConfig.mac.icon = path.join(templateDir, buildConfig.mac.icon)
buildConfig.win.icon = path.join(templateDir, buildConfig.win.icon)

// Specify the correct resources glob
buildConfig.asarUnpack = [
    path.join(templateDir, 'resources', "**")
]

// Transfer configuration file and related services
const assets = {
    copy: [  ],
    transpile: configPath ? [ configPath.split(path.sep).slice(-1)[0], ...Object.values(config.services) ] : []
}


// Ensure the packaged application is saved to a scoped location
buildConfig.directories.output = 'build'
buildConfig.directories.buildResources = 'build'
buildConfig.includeSubNodeModules = true // Allow for grabbing workspace dependencies

// New Vite CLI
import * as vite from 'vite'
import { resolveConfig } from './src/vite.config.js'
import { build } from 'electron-builder'
import { transpileTo } from "./src/build.js";


const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const createReadableName = (name) => name.split('-').map(capitalize).join(' ')

const onExit = (...args) => {
    processOnExit(...args)
}

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})


process.on('beforeExit', onExit);


// Global Variables
const isTypescriptProject = exists('tsconfig.json') || cliArgs.typescript

// if (command === 'init') {

//     const cliName = cliArgs.name
//     const isConfig = (config = {}) => Object.keys(config).length
//     const transformName = (name) => name?.toLowerCase().split(' ').join('-')

//     let name = transformName(cliName ?? (isConfig(config) ? undefined : userPkg.name)) // Get name from CLI, config, or package.json

//     const rejectInitializedConfig = (config, target) => {
//         if (isConfig(config)) {
//             console.error(chalk.red(`${target} is already a commoners project.`))
//             process.exit()
//         }
//     }
//     // Create Project Directory (if not already in one)
//     if (name) {
//         const newDirPath = path.join(process.cwd(), name)
//         config = await getConfig(newDirPath) // Re-fetch config
//         rejectInitializedConfig(config, name)
//         createDirectory(name)
//         process.chdir(name);
//     }

//     rejectInitializedConfig(config, path.basename(process.cwd()))

//     // Create config file to use as the base for the project
//     if (!name) name = path.basename(process.cwd())
//     const ext = isTypescriptProject ? '.ts' : '.js'
//     const filepath = `commoners.config${ext}`
//     const templatepath = path.join(__dirname, 'src', 'templates', `commoners.config.ts`)
//     let templateFileText = readFileSync(templatepath).toString()
//     templateFileText = templateFileText.replace(/name: .*,/g, `name: "${createReadableName(name)}",`)
//     const newFilePath = createFile(filepath, templateFileText)
//     config = await getConfig(path.dirname(newFilePath))

//     // Resolve final name
//     name = config.name.toLowerCase().split(' ').join('-')


//     // Create Template Directories

//     const frontendEntrypoint = cliArgs.frontend ?? config.frontend ?? 'frontend'

//     const frontendDir = path.dirname(frontendEntrypoint)
//     createDirectory(frontendDir)

//     // Create Template Root Files
//     createFile('index.html', () => {
//         const file = readFileSync(path.join(__dirname, 'src/templates/index.html')).toString()
//         return file.replace(/commoners-project/g, createReadableName(name))
//     })

//     createFile('LICENSE', () => readFileSync(path.join(__dirname, 'src/templates/LICENSE')))

//     const pkg = createPackage(name)

//     createFrontend(frontendDir, pkg)

//     // Create Template Backend Files
//     const servicesEntrypoints = config.services ?? {}
//     Object.entries(servicesEntrypoints).forEach(([name, entrypoint]) => createService(name, entrypoint, pkg))

//     console.log(chalk.green(`${name ?? "Project"} initialized!`))
// }


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

const isDev = command === 'dev' || command === 'start'
const isBuild = command.startsWith('build')

// The template for a package.json override at the COMMONERS output directory
const newPkg = {
    name: `commoners-${userPkg.name}`,
    version: userPkg.version,
    type: 'commonjs'
}


if ( isDev || isBuild ) {

    // Ensure main property is added as the 4th entry in the package.json file.
    if (!userPkg.main) {
        console.log(chalk.green('Added a main entry to your package.json'))
        const copy = {}
        Object.entries(userPkg).forEach(([name, value], i) => {
            if (i === 3) copy.main = "./dist/.commoners/main/index.js"
            copy[name] = value
        })
        writeFileSync('package.json', JSON.stringify(copy, null, 2))
    }

    if (existsSync(baseOutDir)) rmSync(baseOutDir, { recursive: true, force: true }) // Clear output directory

    // Copy static assets
    assets.copy.forEach(src => {
        const outPath = path.join(baseOutDir, 'assets', src)
        mkdirSync(path.dirname(outPath), {recursive: true})
        copyFileSync(src, outPath)
    })

    console.log('\n')

    // Run a development server that can be accessed through Electron or the browser
    if (isDev) {
        const server = await vite.createServer(resolveConfig(command))
        await server.listen()
        server.printUrls()
    }

    // Build the entire application, including the Electron backend—and possibly the actual application
    else await vite.build(resolveConfig(command))

    console.log('\n')


    mkdirSync(baseOutDir, { recursive: true }) // Ensure base output directory exists
    writeFileSync(path.join(baseOutDir, 'package.json'), JSON.stringify(newPkg, null, 2)) // Write package.json to ensure these files are treated as commonjs

    // Create an assets folder with copied assets (CommonJS)
    await Promise.all(assets.transpile.map(src => transpileTo(src, path.dirname(path.join(baseOutDir, 'assets', src)))))
    
    // "init:android": "npx cap add android && npm run copy",
    // "init:ios": "npx cap add ios && npm run copy",
    // "copy": "npx cap copy",
    // "android": "npx cap open android",
    // "ios": "npx cap open ios"

    if (isBuild) {
       if (cliArgs.desktop) await build({ config: buildConfig })
       if (cliArgs.ios) console.error(chalk.red('No iOS support yet'))
       if (cliArgs.android) console.error(chalk.red('No Android support yet'))
       if (cliArgs.pwa) console.error(chalk.red('No PWA support yet'))
    }

} 


// else {
//     // checkCommands('build', buildCommands, config.build)
//     checkCommands('publish', publishCommands, config.publish)
// }
#!/usr/bin/env node

import chalk from "chalk";
import minimist from 'minimist';
import path, { extname } from "node:path";

const cliArgs = minimist(process.argv.slice(2))
const args = cliArgs._

// import { initGitRepo } from "./src/github/index.js";
import { createDirectory, createFile, exists, resolveFile } from "./packages/utilities/files.js";
import { spawnProcess, onExit as processOnExit } from "./packages/utilities/processes.js";
import { rootDir, baseOutDir, assetOutDir, commonersPkg, userPkg, defaultMainLocation } from "./globals.js";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { getConfig } from "./packages/utilities/config.js";
// import { createService, createFrontend, createPackage } from "./src/create.js";
import { createAll, resolveAll } from './template/src/main/services/index.js'

let [ command, ...options ] = args
let config = await getConfig()
const configPath = resolveFile('commoners.config', ['.ts', '.js'])

const templateDir = path.join(rootDir, 'template')
import * as yaml from 'js-yaml'
const buildConfig = yaml.load(readFileSync(path.join(templateDir, 'electron-builder.yml')).toString())

const NAME = userPkg.name // Specify the product name
const PLATFORM = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')


// Transfer configuration file and related services

const assets = {
    copy: [ ],
    bundle: configPath ? [ configPath.split(path.sep).slice(-1)[0] ] : []
}

// Bundle Services
const jsExtensions = [ '.js', '.ts' ]
if ('services' in config) {
    Object.values(config.services).forEach(config => {
        const filepath = typeof config === 'string' ? config : config.file
        
        if (!filepath) return // Do not copy if file doesn't exist
        if (isValidURL(filepath)) return // Do not copy if file is a url

        if (jsExtensions.includes(extname(filepath))) assets.bundle.push(filepath)
        else assets.copy.push(filepath)
    })
}

// Copy Icons
if ('icon' in config)  assets.copy.push(...(typeof config.icon === 'string') ? [config.icon] : Object.values(config.icon))

// Bundle Splash Page
if (config.electron?.splash) assets.bundle.push(config.electron.splash)


// New Vite CLI
import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { resolveConfig } from './packages/core/vite.js'
import { build } from 'electron-builder'
import { isValidURL } from "./packages/utilities/url.js";
import { yesNo } from "./packages/core/inquirer.js";


const onExit = (...args) => {
    processOnExit(...args)
}

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})


process.on('beforeExit', onExit);

let withElectron = command === 'start' || (command === 'build' && cliArgs.desktop)

// Ensure project can handle start command
if (withElectron && userPkg.main !== defaultMainLocation) {
    const result = await yesNo('This COMMONERS project is not configured for desktop. Would you like to initialize it?')
    if (result) {
        const copy = {}
        console.log(chalk.green('Added a main entry to your package.json'))
        Object.entries(userPkg).forEach(([name, value], i) => {
            if (i === 3) copy.main = defaultMainLocation
            copy[name] = value
        })
        writeFileSync('package.json', JSON.stringify(copy, null, 2))
    } else {
        withElectron = false
        command = 'dev'
        console.log(chalk.grey('Falling back to the "dev" command'))
    }
}


// Begin parsing the command structure
const isStart = command === 'start'
const isDev = command === 'dev' || !command
const isBuild = command === 'build'
const isLaunch = command === 'launch'

if ( isDev || isStart || isBuild ) {

    if (existsSync(baseOutDir)) rmSync(baseOutDir, { recursive: true, force: true }) // Clear output directory

    const populateOutputDirectory = async () => {
        mkdirSync(baseOutDir, { recursive: true }) // Ensure base output directory exists
    
        writeFileSync(path.join(baseOutDir, 'package.json'), JSON.stringify({ name: `commoners-${userPkg.name}`, version: userPkg.version, type: 'commonjs' }, null, 2)) // Write package.json to ensure these files are treated as commonjs
    
        // Create an assets folder with copied assets (CommonJS)
        await Promise.all(assets.bundle.map(async src => {
    
            const ext = extname(src)
            const outPath = path.join(assetOutDir, src)
            const outDir = path.dirname(outPath)
    
            const root = path.dirname(src)
    
            // Bundle HTML Files using Vite
            if (ext === '.html') await vite.build({
                logLevel: 'silent',
                base: "./",
                root,
                build: {
                    outDir: path.relative(root, outDir),
                    rollupOptions: { input: src }
                },
            })
    
            // Build JavaScript Files using ESBuild
            else {
                const outfile = path.join(outDir, `${path.parse(src).name}.js`)
                await esbuild.build({
                    entryPoints: [ src ],
                    external: ['*.node'],
                    bundle: true,
                    outfile,
                    platform: 'node'
                })
            }
        }))

        // Copy static assets
        assets.copy.map(src => {
            const outPath = path.join(assetOutDir, src)
            const outDir = path.dirname(outPath)
            mkdirSync(outDir, {recursive: true})
            copyFileSync(src, outPath)
        })
    }

    // Run a development server that can be accessed through Electron or the browser
    if ( isDev || isStart ) {

        await populateOutputDirectory()

        // Always resolve all backend services before going forward
        config.services = await resolveAll(config.services)

        const server = await vite.createServer(resolveConfig(config, { build: isBuild, electron: withElectron }))
        await server.listen()

        if (isDev) {
            console.log('\n')
            server.printUrls() // Only show Vite URLs when Electron is not running
            console.log('\n')
            config.services = await createAll(config.services) // Create all backend services
        }
    }

    // Build the entire application, including the Electron backend—and possibly the actual application
    else {
        await vite.build(resolveConfig(config, { electron: withElectron, build: isBuild }))
        await populateOutputDirectory()
    }
    
    // "init:android": "npx cap add android && npm run copy",
    // "init:ios": "npx cap add ios && npm run copy",
    // "copy": "npx cap copy",
    // "android": "npx cap open android",
    // "ios": "npx cap open ios"

    if (isBuild) {

       if (cliArgs.desktop) {

        buildConfig.productName = NAME

        // NOTE: These variables don't get replaced on Windows
        buildConfig.appId = buildConfig.appId.replace('${name}', NAME)
        buildConfig.win.executableName = buildConfig.win.executableName.replace('${name}', NAME)

        
        // Derive Electron version
        if (!('electronVersion' in buildConfig)) {
            const electronVersion = commonersPkg.dependencies.electron
            if (electronVersion[0] === '^') buildConfig.electronVersion = electronVersion.slice(1)
            else buildConfig.electronVersion = electronVersion
        }

        const defaultIcon = config.icon && (typeof config.icon === 'string' ? config.icon : Object.values(config.icon).find(str => typeof str === 'string'))
        const macIcon = config.icon?.mac || defaultIcon
        const winIcon = config.icon?.win || defaultIcon

        // Ensure proper absolute paths are provided for Electron build
        buildConfig.directories.buildResources = path.join(templateDir, buildConfig.directories.buildResources)
        buildConfig.afterSign = path.join(templateDir, buildConfig.afterSign)
        buildConfig.mac.entitlementsInherit = path.join(templateDir, buildConfig.mac.entitlementsInherit)
        buildConfig.mac.icon = macIcon ? path.join(assetOutDir, macIcon) : path.join(templateDir, buildConfig.mac.icon)
        buildConfig.win.icon = winIcon ? path.join(assetOutDir, winIcon) : path.join(templateDir, buildConfig.win.icon)
        buildConfig.includeSubNodeModules = true // Allow for grabbing workspace dependencies

        console.log('Mac Icon', buildConfig.mac.icon)

        // // Specify the correct resources glob
        // buildConfig.asarUnpack = [
        //     path.join(templateDir, 'resources', "**")
        // ]

         await build({ config: buildConfig })
       }
       if (cliArgs.ios) console.error(chalk.red('No iOS support yet'))
       if (cliArgs.android) console.error(chalk.red('No Android support yet'))
       if (cliArgs.pwa) console.error(chalk.red('No PWA support yet'))
    }

} 

if (isLaunch) {
    const electronDistPath = path.join(process.cwd(), buildConfig.directories.output)

    let exePath = ''
    if (PLATFORM === 'mac') exePath = path.join(electronDistPath, PLATFORM, `${NAME}.app`)
    else if (PLATFORM === 'windows') exePath = path.join(electronDistPath, 'win-unpacked', `${NAME}.exe`)
    else throw new Error(`Cannot launch the application for ${PLATFORM}`)

    if (!existsSync(exePath)) throw new Error(`${NAME} has not been built yet.`)

    const debugPort = 8315;
    await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [exePath, '--args', `--remote-debugging-port=${debugPort}`]);

    console.log(chalk.green(`${NAME} launched!`))
    console.log(chalk.gray(`Debug ${NAME} at http://localhost:${debugPort}`))
}


// const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// const createReadableName = (name) => name.split('-').map(capitalize).join(' ')

// const publishCommands = {
//     github: {
//         repo: () => initGitRepo(...args),
//         pages: () => console.log('Publishing to GitHub Pages'),
//         release: () => console.log('Publishing to GitHub Releases'),
//     },
//     npm: () => console.log('Publishing to NPM'),
//     docker: () => console.log('Publishing to Docker'),
//     services: () => console.log('Publishing the services somewhere')
// }

// checkCommands('publish', publishCommands, config.publish)
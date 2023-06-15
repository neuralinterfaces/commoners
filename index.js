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

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { resolveConfig } from './packages/core/vite.js'
import { build } from 'electron-builder'
import { isValidURL } from "./packages/utilities/url.js";
import { yesNo } from "./packages/utilities/inquirer.js";
import { copyAsset } from "./packages/utilities/copy.js";
import * as yaml from 'js-yaml'

// Get CLI Commands
let [ command, ...options ] = args

// Get Configuration File and Path
let config = await getConfig()
const configPath = resolveFile('commoners.config', ['.ts', '.js'])

const templateDir = path.join(rootDir, 'template')
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


// Error Handling for CLI
const onExit = (...args) => processOnExit(...args)

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
    
        writeFileSync(path.join(baseOutDir, 'package.json'), JSON.stringify({ name: `commoners-${NAME}`, version: userPkg.version, type: 'commonjs' }, null, 2)) // Write package.json to ensure these files are treated as commonjs
    
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
        assets.copy.map(src => copyAsset(src))
    }

    const resolveOptions = { 
        electron: withElectron, 
        build: isBuild,
        pwa: cliArgs.pwa 
    }

    // Run a development server that can be accessed through Electron or the browser
    if ( isDev || isStart ) {

        await populateOutputDirectory()

        // Always resolve all backend services before going forward
        config.services = await resolveAll(config.services)

        const server = await vite.createServer(resolveConfig(config, resolveOptions))
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

        // Specify PWA Manifest
        if (cliArgs.pwa) {

            if (!('pwa' in config)) config.pwa = {}
            if (!('includeAssets' in config.pwa)) config.pwa.includeAssets = []

            const fromHTMLPath = path.join(...assetOutDir.split(path.sep).slice(1))
            const icons = config.icon ? (typeof config.icon === 'string' ? [ config.icon ] : Object.values(config.icon)).map(str => path.join(fromHTMLPath, str)) : [] // Provide full path of the icon

            config.pwa.includeAssets.push(...icons) // Include specified assets

            const baseManifest = {
                id: `?com.${NAME}.app=1`,
                start_url: '.',
                theme_color: '#ffffff', // config.design?.theme_color ?? 
                background_color: "#fff",
                display: 'standalone',

                // Dynamic
                name: NAME,
                // short_name: NAME,
                description: userPkg.description,

                // Generated
                icons: icons.map(src => { return { 
                    src, 
                    type: `image/${path.extname(src).slice(1)}`, 
                    sizes: 'any' 
                }})
            }

            if ('manifest' in config.pwa) config.pwa.manifest = { baseManifest, ...config.pwa.manifest }
            else config.pwa.manifest = baseManifest
        }
        
        await vite.build(resolveConfig(config, resolveOptions))

        await populateOutputDirectory()
    }
    
    // "init:android": "npx cap add android && npm run copy",
    // "init:ios": "npx cap add ios && npm run copy",
    // "copy": "npx cap copy",
    // "android": "npx cap open android",
    // "ios": "npx cap open ios"

    if (isBuild) {

       // create a build configuration file for the distrubution
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

         await build({ config: buildConfig })
       }

       if (cliArgs.ios) console.error(chalk.red('No iOS support yet'))
       if (cliArgs.android) console.error(chalk.red('No Android support yet'))
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

// if (command === 'publish') {
//     console.log('Publishing to GitHub Pages + Releases')
//     console.log('Publishing the services somewhere')
// }

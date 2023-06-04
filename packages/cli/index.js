#!/usr/bin/env node

import chalk from "chalk";
import minimist from 'minimist';
import path, { extname } from "path";


const cliArgs = minimist(process.argv.slice(2))
const args = cliArgs._

// import { initGitRepo } from "./src/github/index.js";
import { createDirectory, createFile, exists, resolveFile } from "./src/files.js";
import { spawnProcess, onExit as processOnExit } from "./src/processes.js";
import { __dirname, baseOutDir, assetOutDir, commonersPkg, userPkg } from "./globals.js";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { getConfig } from "./src/config.js";
// import { createService, createFrontend, createPackage } from "./src/create.js";
import { createAll, resolveAll } from '../../template/src/main/services/index.js'

const [command, ...options] = args
let config = await getConfig()
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

// Ensure proper absolute paths are provided for Electron build
// buildConfig.directories.output = path.join(process.cwd(), buildConfig.directories.output)
buildConfig.directories.buildResources = path.join(templateDir, buildConfig.directories.buildResources)
buildConfig.afterSign = path.join(templateDir, buildConfig.afterSign)
buildConfig.mac.entitlementsInherit = path.join(templateDir, buildConfig.mac.entitlementsInherit)
buildConfig.mac.icon = path.join(templateDir, buildConfig.mac.icon)
buildConfig.win.icon = path.join(templateDir, buildConfig.win.icon)

// // Specify the correct resources glob
// buildConfig.asarUnpack = [
//     path.join(templateDir, 'resources', "**")
// ]

// Transfer configuration file and related services
const assets = {
    copy: [ ],
    transpile: configPath ? [ configPath.split(path.sep).slice(-1)[0] ] : []
}

const jsExtensions = [ '.js', '.ts' ]
if ('services' in config) {
    Object.values(config.services).forEach(config => {
        const filepath = typeof config === 'string' ? config : config.file
        
        if (!filepath) return // Do not copy if file doesn't exist
        if (isValidURL(filepath)) return // Do not copy if file is a url

        if (jsExtensions.includes(extname(filepath))) assets.transpile.push(filepath)
        else assets.copy.push(filepath)
    })
}

if (config.electron?.splash) assets.transpile.push(config.electron.splash)


// Ensure the packaged application is saved to a scoped location
buildConfig.includeSubNodeModules = true // Allow for grabbing workspace dependencies

// New Vite CLI
import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { resolveConfig } from './src/vite.config.js'
import { build } from 'electron-builder'
import { isValidURL } from "./src/url.js";


const onExit = (...args) => {
    processOnExit(...args)
}

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})


process.on('beforeExit', onExit);

const isStart = command === 'start'
const isDev = command === 'dev'
const isBuild = command.startsWith('build')

if ( isDev || isStart || isBuild ) {

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
    await Promise.all(assets.copy.map(async src => {
        const outPath = path.join(assetOutDir, src)
        const outDir = path.dirname(outPath)
        mkdirSync(outDir, {recursive: true})
        copyFileSync(src, outPath)
    }))

    const populateOutputDirectory = async () => {
        mkdirSync(baseOutDir, { recursive: true }) // Ensure base output directory exists
    
        writeFileSync(path.join(baseOutDir, 'package.json'), JSON.stringify({ name: `commoners-${userPkg.name}`, version: userPkg.version, type: 'commonjs' }, null, 2)) // Write package.json to ensure these files are treated as commonjs
    
        // Create an assets folder with copied assets (CommonJS)
        await Promise.all(assets.transpile.map(async src => {
    
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
    }

    // Run a development server that can be accessed through Electron or the browser
    if ( isDev || isStart ) {

        await populateOutputDirectory()

        // Always resolve all backend services before going forward
        config.services = await resolveAll(config.services)

        const server = await vite.createServer(resolveConfig(command, config, isStart))
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
        await vite.build(resolveConfig(command, config))
        await populateOutputDirectory()
    }
    
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
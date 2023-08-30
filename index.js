#!/usr/bin/env node

import chalk from "chalk";
import path, { extname } from "node:path";

// import { initGitRepo } from "./src/github/index.js";
import { spawnProcess, onExit as processOnExit } from "./packages/utilities/processes.js";
import { cliArgs, command, target, config, configPath, NAME, PLATFORM, rootDir, outDir, scopedOutDir, assetOutDir, commonersPkg, userPkg, APPID } from "./globals.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// import { createService, createFrontend, createPackage } from "./src/create.js";
import { createAll, resolveAll } from './template/src/main/services/index.js'

import { initGitRepo, publishGHPages } from './packages/utilities/github/index.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { resolveConfig } from './packages/core/vite.js'
import { build } from 'electron-builder'
import { isValidURL } from "./packages/utilities/url.js";
import { copyAsset } from "./packages/utilities/copy.js";
import * as yaml from 'js-yaml'

import * as mobile from './packages/core/mobile'
import { push as pushToGithub } from "./packages/utilities/github/repo.js";
import { getIcon } from "./packages/core/utils/index.js";

// Get Configuration File and Path
const templateDir = path.join(rootDir, 'template')
const buildConfig = yaml.load(readFileSync(path.join(templateDir, 'electron-builder.yml')).toString())

// Transfer configuration file and related services
const assets = {
    copy: [],
    bundle: configPath ? [configPath.split(path.sep).slice(-1)[0]] : []
}

function trackServiceAssets(config) {
    const filepath = typeof config === 'string' ? config : config.src

    if (!filepath) return // Do not copy if file doesn't exist
    if (isValidURL(filepath)) return // Do not copy if file is a url

    if (jsExtensions.includes(extname(filepath))) assets.bundle.push(filepath)
    else assets.copy.push(filepath)
}

// Bundle Services
const jsExtensions = ['.js', '.ts']
if ('services' in config) {
    Object.values(config.services).forEach(trackServiceAssets)
}

// Copy Icons
if ('icon' in config) assets.copy.push(...(typeof config.icon === 'string') ? [config.icon] : Object.values(config.icon))

// Bundle Splash Page
if (config.electron?.splash) assets.bundle.push(config.electron.splash)


// Error Handling for CLI
const onExit = (...args) => processOnExit(...args)

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})

process.on('beforeExit', onExit);

if (command.launch) {


    // Run the mobile builds (if specified)
    if (target.mobile) await mobile.run(target.mobile)

    // Run the electron build
    else if (target.desktop) {
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
}


if (command.dev || command.start || command.build) {

    if (existsSync(scopedOutDir)) rmSync(scopedOutDir, { recursive: true, force: true }) // Clear output directory

    const populateOutputDirectory = async () => {
        mkdirSync(scopedOutDir, { recursive: true }) // Ensure base output directory exists

        writeFileSync(path.join(scopedOutDir, 'package.json'), JSON.stringify({ name: `commoners-${NAME}`, version: userPkg.version, type: 'commonjs' }, null, 2)) // Write package.json to ensure these files are treated as commonjs

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
                    entryPoints: [src],
                    external: ['*.node'],
                    bundle: true,
                    outfile,
                    platform: 'node'
                })
            }
        }))

        // Copy static assets
        assets.copy.map(src => copyAsset(src))

        // Create yml file for dist
        writeFileSync(path.join(outDir, '_config.yml'), `include: ['.commoners']`)
    }

    const resolveOptions = {
        electron: target.desktop,
        build: command.build,
        pwa: cliArgs.pwa
    }

    config.services = await resolveAll(config.services) // Always resolve all backend services before going forward

    // Run a development server that can be accessed through Electron or the browser
    if (command.dev || command.start) {

        await populateOutputDirectory()

        // // Always resolve all backend services before going forward
        // config.services = await resolveAll(config.services)

        const server = await vite.createServer(resolveConfig(config, resolveOptions))
        await server.listen()

        if (command.dev) {
            console.log('\n')
            server.printUrls() // Only show Vite URLs when Electron is not running
            console.log('\n')
            config.services = await createAll(config.services) // Create all backend services
        }
    }

    // Build the entire application, including the Electron backend—and possibly the actual application
    else {

        // Run PWA prebuild to specify manifest file
        if (cliArgs.pwa) {

            if (!('pwa' in config)) config.pwa = {}
            if (!('includeAssets' in config.pwa)) config.pwa.includeAssets = []

            const fromHTMLPath = path.join(...assetOutDir.split(path.sep).slice(1))
            const icons = config.icon ? (typeof config.icon === 'string' ? [config.icon] : Object.values(config.icon)).map(str => path.join(fromHTMLPath, str)) : [] // Provide full path of the icon

            config.pwa.includeAssets.push(...icons) // Include specified assets

            const baseManifest = {
                id: `?${APPID}=1`,

                start_url: '.',

                theme_color: '#ffffff', // config.design?.theme_color ?? 
                background_color: "#fff",
                display: 'standalone',

                // Dynamic
                name: NAME,
                // short_name: NAME,
                description: userPkg.description,

                // Generated
                icons: icons.map(src => {
                    return {
                        src,
                        type: `image/${path.extname(src).slice(1)}`,
                        sizes: 'any'
                    }
                })
            }

            if ('manifest' in config.pwa) config.pwa.manifest = { baseManifest, ...config.pwa.manifest }
            else config.pwa.manifest = baseManifest
        }

        if (target.mobile) await mobile.prebuild(target.mobile) // Run mobile prebuild command

        await vite.build(resolveConfig(config, resolveOptions))

        if (command.build && target.desktop) {
            for (let name in config.services) {
                let { build } = config.services[name] ?? {}
                if (build && typeof build === 'object') build = build[PLATFORM] // Run based on the platform if an object
                if (build) {
                    console.log(chalk.yellow(`Running build command for commoners-${name}-service`))
                    await spawnProcess(build)
                }
            }
        }

        await populateOutputDirectory()
    }

    if (command.build) {

        if (target.desktop) {

            buildConfig.productName = NAME

            // NOTE: These variables don't get replaced on Windows
            buildConfig.appId = buildConfig.appId.replace('${name}', NAME)
            buildConfig.win.executableName = buildConfig.win.executableName.replace('${name}', NAME)

            // Register extra resources
            buildConfig.mac.extraResources = buildConfig.linux.extraResources = Object.values(config.services).reduce((acc, { extraResources }) => {
                if (extraResources) acc.push(...extraResources)
                return acc
            }, [])

            // Derive Electron version
            if (!('electronVersion' in buildConfig)) {
                const electronVersion = commonersPkg.dependencies.electron
                if (electronVersion[0] === '^') buildConfig.electronVersion = electronVersion.slice(1)
                else buildConfig.electronVersion = electronVersion
            }

            const defaultIcon = getIcon(config)
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

        else if (target.mobile) {
            await mobile.init(target.mobile)
            await mobile.open(target.mobile)
        }

    }

}

// ------------- Github Integration ----------------

const ifRepo = async (callback) => {
    const result = await initGitRepo(userPkg, cliArgs).catch(e => {
        console.log(chalk.red(e.message));
        return { valid: false }
    })

    if (result.valid) callback()
    else throw Error('The git repository for this project has been configured incorrectly...')
}

if (command.commit) ifRepo(() => pushToGithub(cliArgs.message))

if (command.publish) ifRepo(() => {
    if (cliArgs.message) pushToGithub(cliArgs.message)
    publishGHPages()
})

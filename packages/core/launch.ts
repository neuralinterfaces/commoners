
import { existsSync, readdirSync} from 'node:fs';
import { extname, join } from 'node:path';
import { cpus } from 'node:os';

import { PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath, chalk, vite } from './globals.js';
import { ConfigResolveOptions, LaunchConfig } from './types.js';
import { printHeader, printTarget, printFailure, printSubtle } from './utils/formatting.js';
import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { createAll } from './assets/services/index.js';
import { resolveConfig } from './index.js';

type ViteServerOptions = import('vite').ServerOptions

const matchFile = (directory, extensions) => {
    if (!existsSync(directory)) return null
    return readdirSync(directory).find(file => {
        const fileExtension = extname(file)
        return extensions.some(ext => fileExtension === ext)
    })
}

const getDesktopPath = (outDir) => {
    let baseDir = ''
    let filename = null

    const platform = {
        mac: PLATFORM === 'mac',
        windows: PLATFORM === 'windows',
        linux: PLATFORM === 'linux'
    }
    
    if (platform.mac) {
        const isMx = /Apple\sM\d+/.test(cpus()[0].model)
        baseDir = join(outDir, `${PLATFORM}${isMx ? '-arm64' : ''}`)
        filename = matchFile(baseDir, [".app"])
    } else if (platform.windows) {
        baseDir = join(outDir, `win-unpacked`)
        filename = matchFile(baseDir, ['.exe'])
    }

    else if (platform.linux) {
        baseDir = join(outDir, `linux-unpacked`)
        filename = matchFile(outDir, ['.AppImage', '.deb', '.rpm', '.snap'])
        if (filename) baseDir = outDir
        else {
            baseDir = join(outDir, `linux-unpacked`)
            filename = matchFile(baseDir, [''])
        }
    }

    const fullPath = filename && join(baseDir, filename)
    if (!fullPath || !existsSync(fullPath)) return null
    return fullPath
}

export const launchServices = async (
    config: LaunchConfig,
    opts?: { services: ConfigResolveOptions["services"] }
) => {

    const resolvedConfig = await resolveConfig(config, { ...opts, build: true })
    const { target, root, services } = resolvedConfig

    const serviceNames = Object.keys(services)
    if (!serviceNames.length) return await printFailure(`No services specified.`)

    // Ensure users can access the created services
    return await createAll(services, { 
        root, 
        target, 
        services: true, 
        build: true 
    })
    
}

export const launchApp = async ( config: LaunchConfig ) => {

    const _chalk = await chalk

    let target = config.target;

    const { 
        root, 
        port,
        public: isPublic
    } = config


    // ---------------------- Auto-Detect Target ----------------------
    if (config.outDir) {
        const desktopPath = getDesktopPath(config.outDir)

        // Autodetect target build type from path
        if (config.outDir){
            if (desktopPath) target = 'electron'
        }
    }

    target = await ensureTargetConsistent(target)
    
    // ---------------------- Launch based on Target ----------------------

    const { 
        outDir = join((root ?? ''), globalWorkspacePath, target) // Default location
    } = config

    await printHeader(`Launching ${printTarget(target)} Build (${outDir})`)

    if (!existsSync(outDir)) {
        await printFailure(`The expected output directory was not found`)
        await printSubtle(`Attempting to launch from ${outDir}`)
        return
    }

    if (isMobile(target)) {
        process.chdir(outDir)
        await mobile.launch(target)
        await printSubtle(`Opening native launcher for ${target}...`)
    }

    else if (isDesktop(target)) {
        
        const fullPath = getDesktopPath(outDir)

        if (!fullPath) throw new Error(`This application has not been built for ${PLATFORM} yet.`)

        let runExecutableCommand = "open" // Default to macOS command
        
        const args = [
            `"${fullPath}"`,  // The executable or path to open
        ];

        // Set the appropriate command based on the platform
        if (PLATFORM === 'windows'|| PLATFORM === 'linux') runExecutableCommand = args.shift() // Run executable directly on Linux
        else if (PLATFORM === 'mac') args.splice(1, 0, "--args") // macOS-specific flag to pass additional arguments


        // Ensure No Sandbox
        if (PLATFORM === 'linux') args.push('--no-sandbox')


        printSubtle([runExecutableCommand, ...args].join(' '))

        await spawnProcess(runExecutableCommand, args, { env: process.env  }); // Share the same environment variables
    } 

    else {

        const __vite = await vite

        const serverConfig = {
            port, 
            open: !process.env.VITEST
        } as ViteServerOptions

        if (isPublic) serverConfig.host = '0.0.0.0'

        const server = await __vite.createServer({
            configFile: false,
            root: outDir,
            server: serverConfig
        })

        await server.listen()

        // Print out the URL if everything was initialized here (i.e. dev mode)
        const { port: resolvedPort, host: resolvedHost } = server.config.server;
        const protocol = server.config.server.https ? 'https' : 'http';
        const url = `${protocol}://localhost:${resolvedPort}`;
        printSubtle(`Server is running on ${_chalk.cyan(url)}${resolvedHost !== 'localhost' ? ` (${resolvedHost})` : ''}`)

        return {
            url, 
            server
        }
    }

    return {}

        
}
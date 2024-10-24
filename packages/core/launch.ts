
import { existsSync, readdirSync} from 'node:fs';
import { extname, join } from 'node:path';
import { cpus } from 'node:os';

import { PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath, chalk } from './globals.js';
import { getFreePorts } from './assets/services/network.js'
import { LaunchOptions } from './types.js';
import { printHeader, printTarget, printFailure, printSubtle } from './utils/formatting.js';
import { spawnProcess } from './utils/processes.js'
import { createServer } from './utils/server.js'

import * as mobile from './mobile/index.js'
import { run } from 'node:test';

const open = import('open').then(m => m.default)

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

export default async function (options: LaunchOptions) {

    const _chalk = await chalk

    let target = options.target;

    if (options.outDir) {
        const desktopPath = getDesktopPath(options.outDir)

        // Autodetect target build type
        if (options.outDir){
            if (desktopPath) target = 'electron'
        }
    }

    target = await ensureTargetConsistent(target)
    
    const { 
        outDir = join((options.root ?? ''), globalWorkspacePath, target),
        port 
    } = options

    await printHeader(`Launching ${printTarget(target)} Build (${outDir})`)

    if (!existsSync(outDir)) return await printFailure(`Directory does not exist.`)

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

        printSubtle([runExecutableCommand, ...args].join(' '))

        await spawnProcess(runExecutableCommand, args, { env: process.env  }); // Share the same environment variables
        
        return
    } 

    else {

        const host = 'localhost'

        const server = createServer({ root: outDir })

        const resolvedPort = port || (await getFreePorts(1))[0]

        const url = `http://${host}:${resolvedPort}`
        server.listen(parseInt(resolvedPort), host, async () => {
            printSubtle(`Server is running on ${_chalk.cyan(url)}`)
            if (!process.env.VITEST) {
                const _open = await open
                _open(url)
            }
        });

        return {
            url, 
            server
        }
        
    }

    return {}

        
}
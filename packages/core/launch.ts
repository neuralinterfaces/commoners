
import { existsSync, readdirSync} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { cpus } from 'node:os';

import { PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath, electronDebugPort, chalk } from './globals.js';
import { getFreePorts } from './templates/services/utils/network.js'
import { LaunchOptions } from './types.js';
import { printHeader, printTarget, printFailure, printSubtle } from './utils/formatting.js';
import { spawnProcess } from './utils/processes.js'
import { createServer } from './utils/server.js'

import * as mobile from './mobile/index.js'

const open = import('open').then(m => m.default)

const getDesktopPath = (outDir) => {
    let baseDir = ''
    let filename = null
    const extensions = []

    const platform = {
        mac: PLATFORM === 'mac',
        windows: PLATFORM === 'windows',
        linux: PLATFORM === 'linux'
    }
    
    if (platform.mac) {
        const isMx = /Apple\sM\d+/.test(cpus()[0].model)
        baseDir = join(outDir, `${PLATFORM}${isMx ? '-arm64' : ''}`)
        extensions.push('.app')
    } else if (platform.windows) {
        baseDir = join(outDir, `win-unpacked`)
        extensions.push('.exe')
    }

    else if (platform.linux) {
        baseDir = join(outDir, `linux-unpacked`)
        extensions.push('.AppImage', '.deb', '.rpm', '.snap')
    }

    if (existsSync(baseDir)) {
        const resolved = readdirSync(baseDir).find(file => extensions.some(ext => file.endsWith(ext)))
        if (resolved) filename = resolved
    }

    const fullPath = filename ? join(baseDir, `"${filename}"`)  : (platform.linux ? baseDir : null)
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

        console.log(`Launching ${fullPath}`)

        await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [
            `${fullPath}`, 
            '--args', 
            `--remote-debugging-port=${electronDebugPort}`, 
            `--remote-allow-origins=*`
        ], { env: process.env  }); // Share the same environment variables

        const debugUrl = `http://localhost:${electronDebugPort}`
        printSubtle(`Debug your application at ${_chalk.cyan(debugUrl)}`)

        return {
            url: debugUrl
        }
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
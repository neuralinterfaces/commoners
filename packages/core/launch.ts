
import { existsSync, readdirSync} from 'node:fs';
import { PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath, electronDebugPort, chalk } from './globals.js';
import { basename, extname, join } from 'node:path';

import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { LaunchOptions } from './types.js';

import { createServer } from './utils/server.js'
import { getFreePorts } from './templates/services/utils/network.js'

import { cpus } from 'node:os';
import { printHeader, printTarget, printFailure, printSubtle } from './utils/formatting.js';


const open = import('open').then(m => m.default)

const isDesktopFolder = (outDir) => {
    let baseDir = ''
    let filename = null
    let ext;
    if (PLATFORM === 'mac') {
        const isMx = /Apple\sM\d+/.test(cpus()[0].model)
        baseDir = join(outDir, `${PLATFORM}${isMx ? '-arm64' : ''}`)
        ext = '.app'
    } else if (PLATFORM === 'windows') {
        baseDir = join(outDir, `win-unpacked`)
        ext = '.exe'
    }

    if (existsSync(baseDir)) filename = readdirSync(baseDir).find(file => file.endsWith(ext))

    const filepath = filename ? join(baseDir, filename) : null
    const name = filename ? basename(filename, extname(filename)) : null

    return {
        name,
        filename,
        base: baseDir,
        filepath
    }
}

export default async function (options: LaunchOptions) {

    const _chalk = await chalk

    let target = options.target;

    const root = options.outDir && existsSync(join(options.outDir, '.commoners')) ? options.outDir : ''
    if (root) delete options.outDir

    if (options.outDir) {
        const desktopInfo = isDesktopFolder(options.outDir)

        // Autodetect target build type
        if (options.outDir){
            if (desktopInfo.filepath) target = 'electron'
        }
    }

    target = await ensureTargetConsistent(target)
    
    const { 
        outDir = join(root, globalWorkspacePath, target),
        port 
    } = options


    await printHeader(`Launching ${printTarget(target)} Build${outDir ? ` (${outDir})` : ''}`)

    if (!existsSync(outDir)) return printFailure(`Directory does not exist.`)

    if (isMobile(target)) {
        if (outDir) process.chdir(outDir)
        await mobile.launch(target)
        await printSubtle(`Opening native launcher for ${target}...`)
    }

    else if (isDesktop(target)) {
        
        const desktopInfo = isDesktopFolder(outDir)

        if (!desktopInfo.filepath || !existsSync(desktopInfo.filepath)) throw new Error(`This application has not been built for ${PLATFORM} yet.`)

        await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [
            `${join(desktopInfo.base, `"${desktopInfo.filename}"`)}`, 
            '--args', 
            `--remote-debugging-port=${electronDebugPort}`, 
            `--remote-allow-origins=*`
        ]);

        const debugUrl = `http://localhost:${electronDebugPort}`
        printSubtle(`Debug your application at ${_chalk.cyan(debugUrl)}`)

        return {
            url: debugUrl
        }
    } 

    else {

        const host = 'localhost'

        const server = createServer({  root: outDir })

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
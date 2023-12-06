
import { existsSync, readdirSync} from 'node:fs';
import { PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath, electronDebugPort } from './globals.js';
import { basename, extname, join } from 'node:path';
import chalk from 'chalk';

import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { LaunchOptions } from './types.js';

import { createServer } from './utils/server.js'
import { getFreePorts } from './templates/services/utils/network.js'

import open from 'open'
import { cpus } from 'node:os';

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
        filepath
    }
}

export default async function (options: LaunchOptions) {

    let target;

    const desktopInfo = isDesktopFolder(options.outDir)

    // Autodetect target build type
    if (options.outDir){
        if (desktopInfo.filepath) target = 'electron'
    }

    target = ensureTargetConsistent(target)
    
    const { 
        outDir = join(globalWorkspacePath, target),
        port 
    } = options


    if (!existsSync(outDir)) {
        return console.error(`${chalk.red(outDir)} directory does not exist.`)
    }

    console.log(`\n✊ Launching ${chalk.bold(chalk.greenBright(`${target}`))} build${outDir ? ` (${outDir})` : ''}\n`)


    if (isMobile(target)) {
        if (outDir) process.chdir(outDir)
        await mobile.launch(target)
        console.log(chalk.gray(`Opened native build tool for ${target}`))
    }

    else if (isDesktop(target)) {
        
        if (!desktopInfo.filepath || !existsSync(desktopInfo.filepath)) throw new Error(`This application has not been built for ${PLATFORM} yet.`)

        await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [`'${desktopInfo.filepath}'`, '--args', `--remote-debugging-port=${electronDebugPort}`]);

        const debugUrl = `http://localhost:${electronDebugPort}`
        console.log(chalk.gray(`Debug ${desktopInfo.name} at ${debugUrl}`))

        return {
            url: debugUrl
        }
    } 

    else {

        const host = 'localhost'

        const server = createServer({  root: outDir })


        const resolvedPort = port || (await getFreePorts(1))[0]

        const url = `http://${host}:${resolvedPort}`
        server.listen(parseInt(resolvedPort), host, () => {
            console.log(chalk.gray(`Server is running on ${chalk.cyan(url)}`))
            if (!process.env.VITEST) open(url)
        });

        return {
            url, 
            server
        }
        
    }

    return {}

        
}
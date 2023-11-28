
import { existsSync} from 'node:fs';
import { NAME, PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath, electronDebugPort } from './globals.js';
import { join } from 'node:path';
import chalk from 'chalk';

import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { LaunchOptions } from './types.js';

import { createServer } from './utils/server.js'
import { getFreePorts } from './templates/services/utils/network.js'

import open from 'open'
import { cpus } from 'node:os';

export default async function (options: LaunchOptions) {

    const target = ensureTargetConsistent(options.target)
    
    const { 
        outDir = join(globalWorkspacePath, target),
        port 
    } = options

    console.log(`\n✊ Launching ${chalk.bold(chalk.greenBright(`${target}`))} build${outDir ? ` (${outDir})` : ''}\n`)


    if (isMobile(target)) {
        if (outDir) process.chdir(outDir)
        await mobile.launch(target)
        console.log(chalk.gray(`Opened native build tool for ${target}`))
    }

    else if (isDesktop(target)) {

        let exePath = ''
        if (PLATFORM === 'mac') {
            const isMx = /Apple\sM\d+/.test(cpus()[0].model)
            exePath = join(outDir, `${PLATFORM}${isMx ? '-arm64' : ''}`, `${NAME}.app`)
        } else if (PLATFORM === 'windows') exePath = join(outDir, 'win-unpacked', `${NAME}.exe`)
        else throw new Error(`Cannot launch the application for ${PLATFORM}`)

        if (!existsSync(exePath)) throw new Error(`${NAME} has not been built for ${PLATFORM} yet.`)

        await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [`'${exePath}'`, '--args', `--remote-debugging-port=${electronDebugPort}`]);

        const debugUrl = `http://localhost:${electronDebugPort}`
        console.log(chalk.gray(`Debug ${NAME} at ${debugUrl}`))

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

import { existsSync} from 'node:fs';
import { NAME, PLATFORM, ensureTargetConsistent, isMobile, isDesktop, globalWorkspacePath } from './globals.js';
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

    console.log(`\n✊ Launching ${chalk.bold(chalk.greenBright(NAME))} for ${target}\n`)
    
    const { 
        outDir = join(globalWorkspacePath, target),
        port 
    } = options


    if (isMobile(target)) {
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

        const debugPort = 8315;
        await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [`'${exePath}'`, '--args', `--remote-debugging-port=${debugPort}`]);

        console.log(chalk.gray(`Debug ${NAME} at http://localhost:${debugPort}`))
    } 

    else {

        const host = 'localhost'

        const server = createServer({  root: outDir })

        const resolvedPort = port || (await getFreePorts(1))[0]

        server.listen(parseInt(resolvedPort), host, () => {
            const url = `http://${host}:${resolvedPort}`
            console.log(chalk.gray(`Server is running on ${chalk.cyan(url)}`))
            open(url)
        });


        
    }

        
}
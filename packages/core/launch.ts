
import { existsSync} from 'node:fs';
import { NAME, getBuildConfig, PLATFORM, ensureTargetConsistent, defaultOutDir } from './globals.js';
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

    const { 
        outDir = defaultOutDir, 
        port 
    } = options

    const target = ensureTargetConsistent(options.target)


    if (target === 'mobile') return await mobile.run(target)

    else if (target === 'desktop') {

        const buildConfig = getBuildConfig()
        const electronDistPath = join(process.cwd(), buildConfig.directories.output)

        let exePath = ''
        if (PLATFORM === 'mac') {
            const cpuModel = cpus()[0].model
            let isMx = /Apple\sM\d+/.test(cpuModel)
            exePath = join(electronDistPath, `${PLATFORM}${isMx ? '-arm64' : ''}`, `${NAME}.app`)
        } else if (PLATFORM === 'windows') exePath = join(electronDistPath, 'win-unpacked', `${NAME}.exe`)
        else throw new Error(`Cannot launch the application for ${PLATFORM}`)

        if (!existsSync(exePath)) throw new Error(`${NAME} has not been built for ${PLATFORM} yet.`)

        const debugPort = 8315;
        await spawnProcess(PLATFORM === 'mac' ? 'open' : 'start', [`'${exePath}'`, '--args', `--remote-debugging-port=${debugPort}`]);

        console.log(chalk.green(`${NAME} launched!`))
        console.log(chalk.gray(`Debug ${NAME} at http://localhost:${debugPort}`))
    } 

    else {

        const host = 'localhost'

        const server = createServer({  root: outDir })

        const resolvedPort = port || (await getFreePorts(1))[0]

        server.listen(parseInt(resolvedPort), host, () => {
            const url = `http://${host}:${resolvedPort}`
            console.log(`Server is running on ${chalk.cyan(url)}`);
            open(url)
        });


        
    }

        
}
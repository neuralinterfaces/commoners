
import { existsSync} from 'node:fs';
import { NAME, getBuildConfig, outDir } from './globals.js';
import { join } from 'node:path';
import chalk from 'chalk';

import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { BaseOptions } from './types.js';

import { createServer } from './utils/server.js'
import { getFreePorts } from './templates/services/utils/network.js'

import open from 'open'

export default async function ({ platform, target }: BaseOptions, port?: number) {

    if (target === 'mobile') return await mobile.run(platform)

    else if (target === 'desktop') {

        const buildConfig = getBuildConfig()
        const electronDistPath = join(process.cwd(), buildConfig.directories.output)

        let exePath = ''
        if (platform === 'mac') exePath = join(electronDistPath, platform, `${NAME}.app`)
        else if (platform === 'windows') exePath = join(electronDistPath, 'win-unpacked', `${NAME}.exe`)
        else throw new Error(`Cannot launch the application for ${platform}`)

        if (!existsSync(exePath)) throw new Error(`${NAME} has not been built for ${platform} yet.`)

        const debugPort = 8315;
        await spawnProcess(platform === 'mac' ? 'open' : 'start', [exePath, '--args', `--remote-debugging-port=${debugPort}`]);

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
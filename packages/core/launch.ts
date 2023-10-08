
import { existsSync } from 'node:fs';
import { NAME, getBuildConfig } from './globals.js';
import path from 'node:path';
import chalk from 'chalk';

import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'
import { BaseOptions } from './types.js';

import http from 'node:http'

export default async function ({ platform, target }: BaseOptions) {

    if (target === 'mobile') return await mobile.run(platform)

    else if (target === 'desktop') {

        const buildConfig = getBuildConfig()
        const electronDistPath = path.join(process.cwd(), buildConfig.directories.output)

        let exePath = ''
        if (platform === 'mac') exePath = path.join(electronDistPath, platform, `${NAME}.app`)
        else if (platform === 'windows') exePath = path.join(electronDistPath, 'win-unpacked', `${NAME}.exe`)
        else throw new Error(`Cannot launch the application for ${platform}`)

        if (!existsSync(exePath)) throw new Error(`${NAME} has not been built for ${platform} yet.`)

        const debugPort = 8315;
        await spawnProcess(platform === 'mac' ? 'open' : 'start', [exePath, '--args', `--remote-debugging-port=${debugPort}`]);

        console.log(chalk.green(`${NAME} launched!`))
        console.log(chalk.gray(`Debug ${NAME} at http://localhost:${debugPort}`))
    } 

    else {
        
        const port = 3000;
        const server = http.createServer();
        console.log(host)
        server.listen(port, host, () => {
            console.log(`Server is running on http://${host}:${port}`);
        });
    }

        
}
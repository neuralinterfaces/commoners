
import { existsSync } from 'node:fs';
import { NAME, getBuildConfig, valid } from '../../globals.js';
import path from 'node:path';
import chalk from 'chalk';

import { spawnProcess } from './utils/processes.js'

import * as mobile from './mobile/index.js'

type LaunchOptions = {
    target: typeof valid.target[number],
    platform: typeof valid.platform[number]
}

export default async ({ platform, target }: LaunchOptions) => {

        if (target === 'mobile') await mobile.run(platform)
        else if (target === 'web') throw new Error('Cannot launch web mode.')

        else {

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
        
}
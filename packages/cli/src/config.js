
import chalk from "chalk";
import path from "path";
import { resolveFile } from "./files.js";
import * as typescript from "./build.js";

export const getFile = async (filepath) => (await typescript.loadModule(filepath)).default

export const getConfig = async (dirPath='', command='init') => {
    const resolvedConfigPath = resolveFile(path.join(dirPath, 'commoners.config'), ['.ts', '.js'])
    if (!resolvedConfigPath && (command !== 'init')) {
        console.error(chalk.red('No commoners.config.js file found.')) // Please create this file in the root of your project.'))
        // process.exit()
    }

    return  resolvedConfigPath ? getFile(resolvedConfigPath) : {}
}
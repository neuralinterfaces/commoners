
import chalk from "chalk";
import path from "path";
import { resolveFile } from "./files.js";
import * as typescript from "./typescript.js";

export const getConfig = async (dirPath='', command='init') => {
    const resolvedConfigPath = resolveFile(path.join(dirPath, 'commoners.config'), ['.ts', '.js'])
    if (!resolvedConfigPath && (command !== 'init')) {
        console.error(chalk.red('No config file found. Please create a commoners.config file in the root of your project.'))
        process.exit()
    }

    return resolvedConfigPath ? (await typescript.loadModule(resolvedConfigPath)).default : {}
}

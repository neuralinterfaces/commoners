import minimist from 'minimist';

// Utilities
import { resolveFile } from "./utils.js";
import chalk from 'chalk';

export const cliArgs = minimist(process.argv.slice(2))
const [ passedCommand ] = cliArgs._

export const outDir = cliArgs.outDir

export const COMMAND = passedCommand as string

function resolveTarget(entry, allowed: string[]){
    if (cliArgs[entry]) {
        const resolved = (typeof cliArgs[entry] === 'string' ) ? cliArgs[entry] : entry
        if (!allowed || allowed.includes(resolved) || entry === resolved) TARGET = resolved
        else throw new Error(`'${resolved}' is not a valid ${entry} target. Allowed targets: ${allowed.join(', ')}`)
    }
}

let TARGET
resolveTarget('desktop', ['electron', 'tauri'])
resolveTarget('mobile', ['android', 'ios'])
resolveTarget('web', ['pwa'])

console.log(`\n✊ ${COMMAND ? COMMAND[0].toUpperCase() + COMMAND.slice(1) : 'Start'}ing your application for ${chalk[TARGET ? 'green' : 'yellow'](chalk.bold(TARGET ?? 'web'))}.\n`)

export {
    TARGET
}

export const configPath = resolveFile('commoners.config', ['.ts', '.js'])
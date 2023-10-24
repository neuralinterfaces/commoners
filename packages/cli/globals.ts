import minimist from 'minimist';

// Utilities
import { resolveFile } from "./utils.js";
import chalk from 'chalk';

import { NAME } from "@commoners/solidarity";

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

export {
    TARGET
}

export const configPath = resolveFile('commoners.config', ['.ts', '.js'])
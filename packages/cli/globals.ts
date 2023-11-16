import minimist from 'minimist';

// Utilities
import { resolveFile } from "./utils.js";

export const cliArgs = minimist(process.argv.slice(2))
const [ passedCommand ] = cliArgs._

export const outDir = cliArgs.outDir

export const COMMAND = passedCommand as string

let TARGET = 'web'

const desktopTargets = ['desktop','electron', 'tauri']
const mobileTargets = ['mobile', 'android', 'ios']
const webTargets = ['web', 'pwa']

const allTargets = [...desktopTargets, ...mobileTargets, ...webTargets]

const target = cliArgs.target
if (typeof target === 'string') {
    if (!allTargets.includes(target)) throw new Error(`'${target}' is not a valid target. Allowed targets: ${allTargets.join(', ')}`)
    TARGET = target
}

export {
    TARGET
}

export const configPath = resolveFile('commoners.config', ['.ts', '.js'])
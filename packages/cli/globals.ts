import minimist from 'minimist';

// Utilities
import { resolveFile } from "./utils.js";

export const cliArgs = minimist(process.argv.slice(2))
const [ passedCommand ] = cliArgs._

export const outDir = cliArgs.outDir

export const COMMAND = passedCommand

// Ensure mutual exclusivity
const target = {
    desktop: cliArgs.desktop || cliArgs.mac || cliArgs.windows || cliArgs.linux,
    mobile: cliArgs.mobile,
    ios: cliArgs.ios,
    android: cliArgs.android,
    pwa: cliArgs.pwa
}

export const TARGET = Object.entries(target).find(([_, value]) => value)?.[0] ?? 'web' // return the key of the first true target

export const configPath = resolveFile('commoners.config', ['.ts', '.js'])
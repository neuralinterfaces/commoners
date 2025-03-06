import { tryStatSync, getEnvFilesForMode } from './utils.js'

import { parse } from 'dotenv'
import { readFileSync } from 'node:fs';

const LOADED = {}

export const loadEnvironmentVariables = (mode: string, root: string) => {

    const identifier = `${mode}:${root}`
    if (LOADED[identifier]) return LOADED[identifier]

    // Align environment loading with Vite's own environment loading—but include non-prefixed variables if desired
    const envFiles = getEnvFilesForMode(mode, root)

    const parsed = Object.fromEntries(
        envFiles.flatMap((filePath) => tryStatSync(filePath)?.isFile() ? Object.entries(parse(readFileSync(filePath))) : [])
    )

    return LOADED[identifier] = Object.entries(parsed).reduce(( acc, [ key, value ] ) => ({ ...acc, [key]: value }), {})
}
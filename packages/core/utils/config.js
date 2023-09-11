
import path from "node:path";
import { resolveFile } from "./files.js";
import { loadConfigFromFile } from 'vite';

// NOTE: Piggyback off of Vite's configuration resolution system 
export const getConfig = async (dirPath='') => {
    const resolvedConfigPath = resolveFile(path.join(dirPath, 'commoners.config'), ['.ts', '.js'])
    return resolvedConfigPath ? (await loadConfigFromFile({command: 'build'}, resolvedConfigPath)).config : {}
}
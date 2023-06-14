
import path from "node:path";
import { resolveFile } from "./files.js";
import * as typescript from "./build.js";

const getFile = async (filepath) => (await typescript.loadModule(filepath)).default

export const getConfig = async (dirPath='') => {
    const resolvedConfigPath = resolveFile(path.join(dirPath, 'commoners.config'), ['.ts', '.js'])
    return resolvedConfigPath ? getFile(resolvedConfigPath) : {}
}
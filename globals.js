import path from "node:path";
import { getJSON, resolveFile } from "./packages/utilities/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from "./packages/utilities/config.js";

export const userPkg = getJSON('package.json')

export const config = await getConfig()
export const configPath = resolveFile('commoners.config', ['.ts', '.js'])

export const NAME = userPkg.name // Specify the product name
export const PLATFORM = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'mac' : 'linux')
export const APPID = `com.${NAME}.app`

export const rootDir = dirname(fileURLToPath(import.meta.url));

export const commonersPkg = getJSON(path.join(rootDir, 'package.json'))

export const outDir = 'dist'
export const scopedOutDir = path.join('dist', '.commoners')

export const assetOutDir = path.join(scopedOutDir, 'assets')

export const defaultMainLocation = path.join(scopedOutDir, 'main', 'index.js')

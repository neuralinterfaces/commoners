import path from "node:path";
import { getJSON } from "./packages/utilities/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = dirname(fileURLToPath(import.meta.url));

export const commonersPkg = getJSON(path.join(rootDir, 'package.json'))

export const userPkg = getJSON('package.json')

export const outDir = 'dist'
export const scopedOutDir = path.join('dist', '.commoners')

export const assetOutDir = path.join(scopedOutDir, 'assets')

export const defaultMainLocation = path.join(scopedOutDir, 'main', 'index.js')
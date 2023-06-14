import path from "node:path";
import { getJSON } from "./packages/utilities/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = dirname(fileURLToPath(import.meta.url));

export const commonersPkg = getJSON(path.join(rootDir, 'package.json'))

export const userPkg = getJSON('package.json')

export const baseOutDir = path.join('dist', '.commoners')
'dist/.commoners'

export const assetOutDir = path.join(baseOutDir, 'assets')

export const defaultMainLocation = path.join(baseOutDir, 'main', 'index.js')
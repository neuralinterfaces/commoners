import path from "node:path";
import { getJSON } from "./src/files.js";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = dirname(fileURLToPath(import.meta.url));

export const commonersPkg = getJSON(path.join(rootDir, 'package.json'))

export const userPkg = getJSON('package.json')

export const baseOutDir = 'dist/.commoners'

export const assetOutDir = path.join(baseOutDir, 'assets')
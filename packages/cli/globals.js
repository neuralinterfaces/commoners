import path from "path";
import url from "url";
import { getJSON } from "./src/files.js";

export const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const commonersPkg = getJSON(path.join(__dirname, '..', '..', 'package.json'))

export const userPkg = getJSON('package.json')

export const baseOutDir = 'dist/.commoners'
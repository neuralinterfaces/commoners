import { join } from "path"


export const commonersDist = globalThis.__dirname ? join(__dirname, '..') : join(process.cwd(), 'dist', '.commoners')
export const commonersAssets = join(commonersDist, 'assets')
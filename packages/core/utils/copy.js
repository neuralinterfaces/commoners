import { copyFileSync, mkdirSync, lstatSync, cpSync } from "node:fs"
import { getAssetOutDir } from "../globals"
import { basename, dirname, join } from "node:path"

export const copyAsset = (input, { outDir }, maintainStructure = true) => {
    const output =  join(getAssetOutDir(outDir), maintainStructure ? input : basename(input))

    const out = dirname(output)
    mkdirSync(out, {recursive: true})
    if (lstatSync(input).isDirectory()) cpSync(input, output, {recursive: true});
    else copyFileSync(input, output)
}
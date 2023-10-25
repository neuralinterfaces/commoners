import { copyFileSync, mkdirSync, lstatSync, cpSync } from "node:fs"
import { basename, dirname, join } from "node:path"

export const copyAsset = (input, { outDir }, maintainStructure = true) => {
    const output =  join(outDir, maintainStructure ? input : basename(input))

    const out = dirname(output)
    mkdirSync(out, {recursive: true})
    if (lstatSync(input).isDirectory()) cpSync(input, output, {recursive: true});
    else copyFileSync(input, output)

    return output
}
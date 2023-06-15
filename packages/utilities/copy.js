import { copyFileSync, mkdirSync } from "node:fs"
import { assetOutDir } from "../../globals"
import { basename, dirname, join } from "node:path"

export const copyAsset = (src, maintainStructure = true) => {
    const outPath = join(assetOutDir, maintainStructure ? src : basename(src))
    const outDir = dirname(outPath)
    mkdirSync(outDir, {recursive: true})
    copyFileSync(src, outPath)
}
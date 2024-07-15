import { copyFileSync, mkdirSync, lstatSync, cpSync } from "node:fs"
import { dirname, relative, sep } from "node:path"

import { safeJoin } from './index'

// NOTE: This should also correct any targeting of this asset as well...
export const getOutputPath = (root, absPath) => {
    absPath = absPath.replace(/^.*?:/, '')
    const _input = relative(root, absPath)
    if (!_input.includes(`..${sep}`)) absPath = _input // Map only if inside the root directory
    return absPath
}

export const copyAsset = (input, output) => {

    const out = dirname(output)
    
    mkdirSync(out, {recursive: true})
    if (lstatSync(input).isDirectory()) cpSync(input, output, {recursive: true, dereference: true });
    else copyFileSync(input, output)

    return output
}


export const copyAssetOld = (input, { outDir, root }, maintainStructure = true) => {

    let tempInputRef = input
    if (maintainStructure) {
        const _input = relative(root, input)
        if (!_input.includes(`..${sep}`)) tempInputRef = _input // Map only if inside the root directory
    }
    
    else tempInputRef = basename(input)

    const output = safeJoin(outDir, tempInputRef)
    return copyAsset(input, output)
}

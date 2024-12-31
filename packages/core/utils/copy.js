import { copyFileSync, mkdirSync, cpSync } from "node:fs"
import { dirname, relative, sep } from "node:path"

import { safeJoin } from '../assets/utils/paths'
import { lstatSync } from './lstat'

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

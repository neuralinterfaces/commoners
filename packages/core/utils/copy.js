import { copyFileSync, mkdirSync, lstatSync, cpSync } from "node:fs"
import { basename, dirname, join, relative, isAbsolute, sep } from "node:path"

export const copyAsset = (input, { outDir, root }, maintainStructure = true) => {

    let tempInputRef = input
    if (maintainStructure) {
        const _input = relative(root, input)
        if (!_input.includes(`..${sep}`)) tempInputRef = _input // Map only if inside the root directory
    }
    
    else tempInputRef = basename(input)
    
    const output = join(outDir, tempInputRef)

    const out = dirname(output)
    mkdirSync(out, {recursive: true})
    if (lstatSync(input).isDirectory()) cpSync(input, output, {recursive: true});
    else copyFileSync(input, output)

    return output
}
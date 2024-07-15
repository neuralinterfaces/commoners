import { copyFileSync, mkdirSync, lstatSync, cpSync } from "node:fs"
import { dirname, relative, sep } from "node:path"

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
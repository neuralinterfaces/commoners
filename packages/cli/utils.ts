import { existsSync } from "node:fs"
import { extname, resolve } from "node:path"

const checkFile = (name, ext, exts) => {
    const hasExt = exts.includes(extname(name))
    const p = (hasExt)? name : resolve(process.cwd(), `${name}${ext}`)
    if (existsSync(p)) return p
}


export const resolveFile = (name, extensions) => {
    for (const ext of extensions) {
        const res = checkFile(name, ext, extensions)
        if (res) return res
    }
}
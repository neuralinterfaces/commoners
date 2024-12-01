import { existsSync, readFileSync, rmSync } from "node:fs"
import { extname, resolve } from "node:path"

export const getJSON = (path) => {
    if (existsSync(path)) {
        let res = JSON.parse(readFileSync(path));
        if (typeof res === 'string') res = JSON.parse(res) // Ensure that the JSON has been parsed
        return res
    }
    else return {};
}

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

// NOTE: This is called multiple times for the same directory. Why?
export const removeDirectory = (directory) => {

    if (existsSync(directory)) {
        try { 
            rmSync(directory, { recursive: true, force: true }) // Clear output directory (similar to Vite)
        } 
        
        // Attempt a second time if failed. This will usually be sufficient for Windows.
        catch { 
            try { rmSync(directory, { recursive: true, force: true }) } catch {}
        }
    }
}
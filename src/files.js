import path from 'path';
import fs from 'fs'

export const getCurrentDirectoryBase = () => {
    return path.basename(process.cwd());
}

export const directoryExists = (filePath) => fs.existsSync(filePath);
    
const checkFile = (name, ext, exts) => {
    const hasExt = exts.includes(path.extname(name))
    const p = (hasExt)? name : path.resolve(process.cwd(), `${name}${ext}`)
    if (fs.existsSync(p)) return p
}


export const resolveFile = (name, extensions, getDefault) => {

    // Check if the file exists
    for (const ext of extensions) {
        const res = checkFile(name, ext, extensions)
        if (res) return res
    }

    // Default to user-specified file if no file is found
    for (const ext of extensions) {
        const res = checkFile(getDefault(ext), ext, extensions)
        if (res) return res
    }
}
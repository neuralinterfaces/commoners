import { lstatSync as getStats } from "node:fs"

export const lstatSync = (path) => {
    if (path.length >= 260 && process.platform === 'win32') path = "\\\\?\\" + path
    return getStats(path)
}
  
import { join } from 'node:path'

// Functions to handle merging two absolute paths on Windows (e.g. targeting template assets)
export const safePath = (path) => path.replace(/^.*?:/, '')

export const safeJoin = (...paths) => join(paths[0], ...paths.slice(1).map(safePath))
